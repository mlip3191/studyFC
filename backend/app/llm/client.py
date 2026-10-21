"""Thin wrapper around the Anthropic SDK: forced tool use, retry/backoff, readable errors."""

import logging
import random
import time
from collections.abc import Callable
from typing import Protocol

import anthropic
from pydantic import ValidationError

from app.llm.merge import RawCard
from app.llm.templates import Density, system_prompt, user_prompt

log = logging.getLogger(__name__)

TOOL_NAME = "submit_flashcards"
MAX_OUTPUT_TOKENS = 16_000
MAX_ATTEMPTS = 5
BASE_DELAY_SECONDS = 2.0
MAX_DELAY_SECONDS = 60.0

TOOL = {
    "name": TOOL_NAME,
    "description": "Submit the flashcards created for this section of the document.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "cards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["qa", "term"],
                            "description": "qa = question/answer, term = term/definition.",
                        },
                        "front": {"type": "string", "description": "Question or term."},
                        "back": {"type": "string", "description": "Answer or definition."},
                        "group_name": {
                            "type": "string",
                            "description": "Topic group. Reuse existing names exactly.",
                        },
                    },
                    "required": ["type", "front", "back", "group_name"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["cards"],
        "additionalProperties": False,
    },
}


class GenerationError(Exception):
    """A failure whose message is safe to show to the user."""


class MissingApiKeyError(GenerationError):
    def __init__(self) -> None:
        super().__init__(
            "No Anthropic API key is configured. Set ANTHROPIC_API_KEY in your .env file "
            "and restart the app. Browsing, editing and studying decks works without a key."
        )


class TruncatedResponseError(GenerationError):
    """The model hit the output limit, so this section produced too many cards at once."""


class CardGenerator(Protocol):
    def generate(
        self,
        *,
        chunk_text: str,
        chunk_number: int,
        chunk_total: int,
        density: Density,
        group_names: list[str],
    ) -> list[RawCard]: ...


def _is_transient(exc: Exception) -> bool:
    if isinstance(
        exc,
        anthropic.RateLimitError | anthropic.APIConnectionError | anthropic.InternalServerError,
    ):
        return True
    return isinstance(exc, anthropic.APIStatusError) and exc.status_code in (408, 409, 429, 529)


def _friendly(exc: Exception) -> GenerationError:
    if isinstance(exc, anthropic.AuthenticationError):
        return GenerationError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY.")
    if isinstance(exc, anthropic.PermissionDeniedError):
        return GenerationError("This API key is not allowed to use the selected model.")
    if isinstance(exc, anthropic.NotFoundError):
        return GenerationError("The selected model was not found. Check ANTHROPIC_MODEL.")
    if isinstance(exc, anthropic.RateLimitError):
        return GenerationError("Rate limited by Anthropic. Wait a minute and try again.")
    if isinstance(exc, anthropic.APIConnectionError):
        return GenerationError("Could not reach the Anthropic API. Check your connection.")
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code == 529:
        return GenerationError("Anthropic's API is overloaded right now. Try again shortly.")
    if isinstance(exc, anthropic.InternalServerError):
        return GenerationError("Anthropic's API had a server error. Try again shortly.")
    if isinstance(exc, anthropic.BadRequestError):
        detail = getattr(exc, "message", str(exc))
        if "credit balance" in str(detail).lower():
            return GenerationError("Your Anthropic account is out of credits.")
        return GenerationError(f"Anthropic rejected the request: {detail}")
    return GenerationError(f"Unexpected error calling Anthropic: {exc}")


class ClaudeClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        client: anthropic.Anthropic | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not api_key and client is None:
            raise MissingApiKeyError
        self.model = model
        # The wrapper owns retries so backoff behaviour is consistent and testable.
        self._client = client or anthropic.Anthropic(api_key=api_key, max_retries=0, timeout=300)
        self._sleep = sleep

    def _create(self, **kwargs):
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return self._client.messages.create(**kwargs)
            except anthropic.AnthropicError as exc:
                if _is_transient(exc) and attempt < MAX_ATTEMPTS:
                    delay = min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * 2 ** (attempt - 1))
                    delay += random.uniform(0, delay / 4)
                    log.warning("Transient API error (%s); retry %d in %.1fs", exc, attempt, delay)
                    self._sleep(delay)
                    continue
                raise _friendly(exc) from exc
        raise AssertionError("unreachable")

    def generate(
        self,
        *,
        chunk_text: str,
        chunk_number: int,
        chunk_total: int,
        density: Density,
        group_names: list[str],
    ) -> list[RawCard]:
        message = self._create(
            model=self.model,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=[
                {"type": "text", "text": system_prompt(), "cache_control": {"type": "ephemeral"}}
            ],
            tools=[TOOL],
            # Forced tool_choice is rejected by newer models; the prompt instructs the tool call
            # and `strict` keeps the arguments schema-valid.
            tool_choice={"type": "auto"},
            messages=[
                {
                    "role": "user",
                    "content": user_prompt(
                        chunk_text=chunk_text,
                        chunk_number=chunk_number,
                        chunk_total=chunk_total,
                        density=density,
                        group_names=group_names,
                    ),
                }
            ],
        )
        if message.stop_reason == "max_tokens":
            raise TruncatedResponseError("The model ran out of output space for this section.")
        return parse_tool_result(message)


def parse_tool_result(message) -> list[RawCard]:
    for block in message.content:
        if getattr(block, "type", None) == "tool_use" and block.name == TOOL_NAME:
            items = block.input.get("cards", []) if isinstance(block.input, dict) else []
            cards: list[RawCard] = []
            for item in items:
                try:
                    cards.append(RawCard.model_validate(item))
                except ValidationError:
                    log.warning("Dropping malformed card from model output: %r", item)
            return cards
    raise GenerationError("The model did not return any flashcards for a section. Try again.")
