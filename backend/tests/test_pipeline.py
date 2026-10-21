from types import SimpleNamespace

import anthropic
import httpx
import pytest

from app.llm import templates
from app.llm.client import (
    TOOL_NAME,
    ClaudeClient,
    GenerationError,
    MissingApiKeyError,
    TruncatedResponseError,
    parse_tool_result,
)
from app.llm.merge import RawCard
from app.llm.pipeline import default_title, generate_deck
from app.parsers import parse_pasted
from app.storage import DeckRepository


class FakeGenerator:
    """Stands in for ClaudeClient. `script` maps chunk number -> list of RawCard."""

    def __init__(self, script=None, truncate_over: int | None = None):
        self.calls: list[dict] = []
        self.script = script or {}
        self.truncate_over = truncate_over

    def generate(self, *, chunk_text, chunk_number, chunk_total, density, group_names):
        self.calls.append(
            dict(
                text=chunk_text,
                number=chunk_number,
                total=chunk_total,
                density=density,
                groups=list(group_names),
            )
        )
        if self.truncate_over is not None and len(chunk_text) > self.truncate_over:
            raise TruncatedResponseError("too big")
        default = [RawCard(type="qa", front=f"Q about {chunk_text[:12]}", back="A", group_name="G")]
        return self.script.get(chunk_number, default)


def sections(n: int, size: int = 100) -> str:
    return "\n\n".join(f"## Section {i}\n\n" + "t" * size for i in range(n))


def test_generates_and_saves_deck_with_progress(repo: DeckRepository):
    script = {
        1: [RawCard(type="qa", front="q1", back="a1", group_name="Topic A")],
        2: [
            RawCard(type="term", front="t2", back="d2", group_name="topic a"),
            RawCard(type="qa", front="q1", back="dup", group_name="Topic B"),
        ],
        3: [RawCard(type="qa", front="q3", back="a3", group_name="Topic B")],
    }
    gen = FakeGenerator(script)
    progress: list[tuple[int, int]] = []
    deck = generate_deck(
        parse_pasted(sections(3)),
        filename="guide.pdf",
        title=None,
        density="exhaustive",
        generator=gen,
        repo=repo,
        on_progress=lambda i, n: progress.append((i, n)),
        max_chunk_chars=150,
    )
    assert progress == [(1, 3), (2, 3), (3, 3)]
    assert deck.title == "guide"
    assert deck.source and deck.source.filename == "guide.pdf"
    assert [g.name for g in deck.groups] == ["Topic A", "Topic B"]
    assert [c.front for c in deck.cards] == ["q1", "t2", "q3"]  # duplicate q1 dropped
    assert repo.get(deck.id) == deck
    # later chunks are told which groups already exist
    assert gen.calls[0]["groups"] == []
    assert gen.calls[1]["groups"] == ["Topic A"]
    assert gen.calls[2]["groups"] == ["Topic A", "Topic B"]
    assert {c["density"] for c in gen.calls} == {"exhaustive"}


def test_custom_title_wins(repo: DeckRepository):
    deck = generate_deck(
        parse_pasted("# T\n\nbody"),
        filename="f.md",
        title="  My Title ",
        density="standard",
        generator=FakeGenerator(),
        repo=repo,
    )
    assert deck.title == "My Title"


def test_default_title():
    assert default_title("midterm.pdf") == "midterm"
    assert default_title(None) == "Pasted study guide"


def test_truncated_response_splits_chunk_and_retries(repo: DeckRepository):
    gen = FakeGenerator(truncate_over=250)
    generate_deck(
        parse_pasted("## Big\n\n" + "\n\n".join("p" * 100 for _ in range(6))),
        filename=None,
        title=None,
        density="standard",
        generator=gen,
        repo=repo,
        max_chunk_chars=10_000,
    )
    assert len(gen.calls) > 1
    accepted = [c for c in gen.calls if len(c["text"]) <= 250]
    assert len(accepted) >= 3  # the oversize chunk was halved until the pieces fit
    assert sum(c["text"].count("p" * 100) for c in accepted) == 6  # nothing lost


def test_unsplittable_truncation_gives_readable_error(repo: DeckRepository):
    gen = FakeGenerator(truncate_over=0)
    with pytest.raises(GenerationError, match="too many cards"):
        generate_deck(
            parse_pasted("## A\n\n" + "word " * 200),
            filename=None,
            title=None,
            density="standard",
            generator=gen,
            repo=repo,
        )


def test_no_cards_is_an_error_and_nothing_saved(repo: DeckRepository):
    gen = FakeGenerator({1: []})
    with pytest.raises(GenerationError, match="No flashcards"):
        generate_deck(
            parse_pasted("# A\n\nbody"),
            filename="a.md",
            title=None,
            density="light",
            generator=gen,
            repo=repo,
        )
    assert repo.list().decks == []


# ---- prompts ---------------------------------------------------------------


def test_user_prompt_includes_density_groups_and_text():
    prompt = templates.user_prompt(
        chunk_text="Hello {{density_guidance}} world",
        chunk_number=2,
        chunk_total=5,
        density="light",
        group_names=["Alpha", "Beta"],
    )
    assert "Density: LIGHT" in prompt
    assert "section 2 of 5" in prompt
    assert "- Alpha\n- Beta" in prompt
    # placeholder-looking text inside the document is not substituted
    assert "Hello {{density_guidance}} world" in prompt
    assert "{{" not in prompt.replace("{{density_guidance}}", "")


def test_all_density_templates_exist():
    for density in templates.DENSITIES:
        assert templates.density_guidance(density)
    assert "one fact per card" in templates.system_prompt().lower()


# ---- Claude client (SDK mocked) -------------------------------------------


def tool_message(cards, stop_reason="tool_use"):
    block = SimpleNamespace(type="tool_use", name=TOOL_NAME, input={"cards": cards})
    return SimpleNamespace(content=[block], stop_reason=stop_reason)


class FakeSdk:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls: list[dict] = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def api_error(cls, status: int, message: str = "boom"):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(status, request=request)
    return cls(message, response=response, body=None)


def make_client(outcomes):
    sdk = FakeSdk(outcomes)
    sleeps: list[float] = []
    client = ClaudeClient("key", "test-model", client=sdk, sleep=sleeps.append)
    return client, sdk, sleeps


def call(client):
    return client.generate(
        chunk_text="text", chunk_number=1, chunk_total=1, density="standard", group_names=[]
    )


def test_client_sends_tool_call_and_parses_cards():
    good = {"type": "term", "front": "f", "back": "b", "group_name": "g"}
    bad = {"type": "nonsense", "front": "x"}
    client, sdk, _ = make_client([tool_message([good, bad])])
    cards = call(client)
    assert [c.front for c in cards] == ["f"]
    kwargs = sdk.calls[0]
    assert kwargs["model"] == "test-model"
    assert kwargs["tool_choice"] == {"type": "auto"}
    assert kwargs["tools"][0]["strict"] is True
    assert kwargs["tools"][0]["name"] == TOOL_NAME


def test_client_retries_transient_errors_with_backoff():
    good = {"type": "qa", "front": "f", "back": "b", "group_name": "g"}
    client, sdk, sleeps = make_client(
        [
            api_error(anthropic.RateLimitError, 429),
            api_error(anthropic.InternalServerError, 529),
            tool_message([good]),
        ]
    )
    assert len(call(client)) == 1
    assert len(sdk.calls) == 3
    assert len(sleeps) == 2
    assert sleeps[1] > sleeps[0]


def test_client_gives_up_after_max_attempts_with_readable_message():
    client, sdk, sleeps = make_client([api_error(anthropic.RateLimitError, 429)] * 5)
    with pytest.raises(GenerationError, match="Rate limited"):
        call(client)
    assert len(sdk.calls) == 5
    assert len(sleeps) == 4


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (api_error(anthropic.AuthenticationError, 401), "rejected the API key"),
        (api_error(anthropic.NotFoundError, 404), "model was not found"),
        (api_error(anthropic.BadRequestError, 400, "bad thing"), "bad thing"),
    ],
)
def test_client_does_not_retry_permanent_errors(error, message):
    client, sdk, sleeps = make_client([error])
    with pytest.raises(GenerationError, match=message):
        call(client)
    assert len(sdk.calls) == 1
    assert sleeps == []


def test_client_truncation_raises_truncated_error():
    client, _, _ = make_client([tool_message([], stop_reason="max_tokens")])
    with pytest.raises(TruncatedResponseError):
        call(client)


def test_missing_api_key():
    with pytest.raises(MissingApiKeyError, match="ANTHROPIC_API_KEY"):
        ClaudeClient("", "model")


def test_response_without_tool_call_is_an_error():
    message = SimpleNamespace(content=[SimpleNamespace(type="text", text="hi")], stop_reason="x")
    with pytest.raises(GenerationError):
        parse_tool_result(message)
