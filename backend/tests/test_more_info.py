from pathlib import Path
from types import SimpleNamespace as NS

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.llm.client import ClaudeClient, GenerationError, MissingApiKeyError
from app.llm.more_info import MoreInfo, MoreInfoSource, extract_more_info
from app.main import create_app
from app.models import Deck


def text(body: str, *citations: tuple[str, str]):
    cites = [NS(type="web_search_result_location", url=u, title=t) for u, t in citations]
    return NS(type="text", text=body, citations=cites or None)


def search_result(*pages: tuple[str, str]):
    items = [NS(type="web_search_result", url=u, title=t) for u, t in pages]
    return NS(type="web_search_tool_result", content=items)


# ---- extraction -----------------------------------------------------------


def test_cited_sources_come_first_then_other_results_deduped():
    info = extract_more_info(
        [
            NS(type="server_tool_use", name="web_search"),
            search_result(("https://a.example/1", "A one"), ("https://b.example/2", "B two")),
            text("First part. ", ("https://b.example/2", "B two")),
            text("Second part.", ("https://b.example/2", "B two (again)")),
        ]
    )
    assert info.explanation == "First part. Second part."
    assert [s.url for s in info.sources] == ["https://b.example/2", "https://a.example/1"]
    assert info.sources[0].title == "B two"


def test_unsafe_and_malformed_urls_are_dropped():
    info = extract_more_info(
        [
            search_result(
                ("javascript:alert(1)", "bad"),
                ("ftp://x.example/f", "ftp"),
                ("not a url", "junk"),
                ("https://ok.example/page", ""),
            ),
            text("Body"),
        ]
    )
    assert [s.url for s in info.sources] == ["https://ok.example/page"]
    assert info.sources[0].title == "ok.example"  # falls back to the host name


def test_search_error_result_is_ignored_and_sources_capped():
    error_block = NS(type="web_search_tool_result", content=NS(error_code="max_uses_exceeded"))
    pages = tuple((f"https://s{i}.example", f"S{i}") for i in range(9))
    info = extract_more_info([error_block, search_result(*pages), text("Body")])
    assert len(info.sources) == 5


# ---- client ---------------------------------------------------------------


class FakeSdk:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls: list[dict] = []
        self.messages = NS(create=self._create)

    def _create(self, **kwargs):
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def reply(content, stop_reason="end_turn"):
    return NS(content=content, stop_reason=stop_reason)


def api_error(cls, status: int, message: str):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls(message, response=httpx.Response(status, request=request), body=None)


def explain(sdk: FakeSdk) -> MoreInfo:
    client = ClaudeClient("k", "test-model", client=sdk, sleep=lambda _: None)
    return client.explain(
        deck_title="Wealth", group_name="Ratios", card_type="term", front="Sharpe", back="Risk adj."
    )


def test_explain_uses_web_search_and_returns_sources():
    sdk = FakeSdk([reply([text("Detail.", ("https://x.example/sharpe", "Sharpe"))])])
    info = explain(sdk)
    assert info.explanation == "Detail."
    assert info.sources == [MoreInfoSource(title="Sharpe", url="https://x.example/sharpe")]
    call = sdk.calls[0]
    assert call["tools"][0]["type"].startswith("web_search_")
    prompt = call["messages"][0]["content"]
    assert "Deck: Wealth" in prompt and "Group: Ratios" in prompt and "Front: Sharpe" in prompt
    assert "term and definition" in prompt


def test_explain_resumes_paused_turns():
    first = [NS(type="server_tool_use", name="web_search")]
    sdk = FakeSdk([reply(first, "pause_turn"), reply([text("Done.", ("https://x.example", "X"))])])
    info = explain(sdk)
    assert info.explanation == "Done."
    resumed = sdk.calls[1]["messages"]
    assert [m["role"] for m in resumed] == ["user", "assistant"]
    assert resumed[1]["content"] == first


def test_explain_falls_back_to_no_search_when_tool_is_rejected():
    sdk = FakeSdk(
        [
            api_error(anthropic.BadRequestError, 400, "web search is not enabled"),
            reply([text("Plain explanation.")]),
        ]
    )
    info = explain(sdk)
    assert info.explanation == "Plain explanation." and info.sources == []
    assert "tools" in sdk.calls[0] and "tools" not in sdk.calls[1]


def test_explain_does_not_mask_other_errors():
    sdk = FakeSdk([api_error(anthropic.AuthenticationError, 401, "bad key")])
    with pytest.raises(GenerationError, match="rejected the API key"):
        explain(sdk)
    assert len(sdk.calls) == 1


def test_explain_empty_answer_is_an_error():
    with pytest.raises(GenerationError, match="did not return an explanation"):
        explain(FakeSdk([reply([])]))


# ---- route ----------------------------------------------------------------


class StubExplainer:
    def __init__(self, result=None, error: Exception | None = None):
        self.result = result or MoreInfo(
            explanation="More detail.", sources=[MoreInfoSource(title="T", url="https://t.example")]
        )
        self.error = error
        self.calls: list[dict] = []

    def explain(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result


def make_client(tmp_path: Path, factory, deck: Deck) -> TestClient:
    settings = Settings(anthropic_api_key="k", decks_dir=tmp_path / "decks", _env_file=None)
    app = create_app(settings, generator_factory=factory)
    app.state.repo.save(deck)
    return TestClient(app)


URL = "/api/decks/d00001/cards/c2/more-info"


def test_route_returns_explanation_and_passes_card_context(tmp_path: Path, sample_deck: Deck):
    stub = StubExplainer()
    client = make_client(tmp_path, lambda: stub, sample_deck)
    body = client.post(URL).json()
    assert body["explanation"] == "More detail."
    assert body["sources"] == [{"title": "T", "url": "https://t.example"}]
    assert stub.calls == [
        dict(
            deck_title="Sample Deck",
            group_name="One",
            card_type="term",
            front="Term",
            back="Definition",
        )
    ]


def test_route_errors(tmp_path: Path, sample_deck: Deck):
    def no_key():
        raise MissingApiKeyError

    assert make_client(tmp_path, no_key, sample_deck).post(URL).status_code == 400
    failing = StubExplainer(error=GenerationError("Rate limited by Anthropic."))
    resp = make_client(tmp_path / "b", lambda: failing, sample_deck).post(URL)
    assert resp.status_code == 502 and resp.json()["detail"] == "Rate limited by Anthropic."
    ok = make_client(tmp_path / "c", lambda: StubExplainer(), sample_deck)
    assert ok.post("/api/decks/d00001/cards/nope/more-info").status_code == 404
    assert ok.post("/api/decks/nope/cards/c1/more-info").status_code == 404
