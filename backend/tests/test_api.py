from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.llm.client import MissingApiKeyError
from app.llm.merge import RawCard
from app.main import create_app
from app.models import Deck
from app.storage import DeckRepository

FIXTURES = Path(__file__).parent / "fixtures"


class StubGenerator:
    def __init__(self, fail_with: Exception | None = None):
        self.fail_with = fail_with
        self.calls = 0

    def generate(self, *, chunk_text, chunk_number, chunk_total, density, group_names):
        self.calls += 1
        if self.fail_with:
            raise self.fail_with
        return [
            RawCard(type="qa", front=f"Q{chunk_number}?", back="A", group_name="Topic"),
            RawCard(type="term", front=f"T{chunk_number}", back="D", group_name="Topic"),
        ]


def make_client(tmp_path: Path, *, api_key: str = "k", generator=None) -> TestClient:
    settings = Settings(
        anthropic_api_key=api_key, decks_dir=tmp_path / "decks", max_upload_mb=1, _env_file=None
    )
    gen = generator or StubGenerator()

    def factory():
        if not api_key:
            raise MissingApiKeyError
        return gen

    return TestClient(create_app(settings, generator_factory=factory))


@pytest.fixture
def client(tmp_path: Path, sample_deck: Deck) -> TestClient:
    c = make_client(tmp_path)
    c.app.state.repo.save(sample_deck)
    return c


DECK = "/api/decks/d00001"


def test_health_and_config(client: TestClient):
    assert client.get("/api/health").json() == {"status": "ok"}
    cfg = client.get("/api/config").json()
    assert cfg["api_key_configured"] is True
    assert ".pdf" in cfg["supported_extensions"]


def test_list_get_rename_delete_deck(client: TestClient):
    listing = client.get("/api/decks").json()
    assert listing["decks"][0]["card_count"] == 3 and listing["errors"] == []
    assert client.get(DECK).json()["title"] == "Sample Deck"
    assert client.patch(DECK, json={"title": " New "}).json()["title"] == "New"
    assert client.patch(DECK, json={"title": ""}).status_code == 422
    assert client.delete(DECK).status_code == 204
    assert client.get(DECK).status_code == 404
    assert client.delete(DECK).status_code == 404


def test_invalid_deck_file_listed_as_error(client: TestClient, tmp_path: Path):
    (tmp_path / "decks" / "bad.json").write_text("{oops", encoding="utf-8")
    body = client.get("/api/decks").json()
    assert len(body["decks"]) == 1
    assert body["errors"][0]["filename"] == "bad.json"


def test_group_create_rename_reorder(client: TestClient):
    deck = client.post(f"{DECK}/groups", json={"name": " Three "}).json()
    assert [g["name"] for g in deck["groups"]] == ["One", "Two", "Three"]
    gid = deck["groups"][2]["id"]

    assert client.post(f"{DECK}/groups", json={"name": "three"}).status_code == 409
    assert client.patch(f"{DECK}/groups/{gid}", json={"name": "One"}).status_code == 409

    deck = client.patch(f"{DECK}/groups/{gid}", json={"name": "Third"}).json()
    assert deck["groups"][2]["name"] == "Third"

    deck = client.patch(f"{DECK}/groups/{gid}", json={"order": 0}).json()
    assert [g["name"] for g in deck["groups"]] == ["Third", "One", "Two"]
    assert [g["order"] for g in deck["groups"]] == [0, 1, 2]
    assert client.patch(f"{DECK}/groups/nope", json={"name": "x"}).status_code == 404


def test_group_merge(client: TestClient):
    deck = client.post(f"{DECK}/groups/merge", json={"source_id": "g1", "target_id": "g2"}).json()
    assert [g["id"] for g in deck["groups"]] == ["g2"]
    assert {c["group_id"] for c in deck["cards"]} == {"g2"}
    assert len(deck["cards"]) == 3
    same = client.post(f"{DECK}/groups/merge", json={"source_id": "g2", "target_id": "g2"})
    assert same.status_code == 400


def test_group_delete_requires_target_or_flag(client: TestClient):
    assert client.delete(f"{DECK}/groups/g1").status_code == 400
    assert client.delete(f"{DECK}/groups/g1?move_to=g1").status_code == 400
    assert client.delete(f"{DECK}/groups/g1?move_to=nope").status_code == 404

    moved = client.delete(f"{DECK}/groups/g1?move_to=g2").json()
    assert [g["id"] for g in moved["groups"]] == ["g2"] and len(moved["cards"]) == 3

    deleted = client.delete(f"{DECK}/groups/g2?delete_cards=true").json()
    assert deleted["groups"] == [] and deleted["cards"] == []


def test_empty_group_deletes_without_flags(client: TestClient):
    gid = client.post(f"{DECK}/groups", json={"name": "Empty"}).json()["groups"][-1]["id"]
    assert client.delete(f"{DECK}/groups/{gid}").status_code == 200


def test_card_crud(client: TestClient):
    deck = client.post(
        f"{DECK}/cards", json={"group_id": "g2", "type": "term", "front": " F ", "back": "B"}
    ).json()
    new = deck["cards"][-1]
    assert (new["front"], new["group_id"], new["type"]) == ("F", "g2", "term")

    deck = client.patch(
        f"{DECK}/cards/{new['id']}",
        json={"front": "F2", "back": "B2", "type": "qa", "group_id": "g1"},
    ).json()
    edited = next(c for c in deck["cards"] if c["id"] == new["id"])
    assert (edited["front"], edited["back"], edited["type"], edited["group_id"]) == (
        "F2",
        "B2",
        "qa",
        "g1",
    )

    assert client.patch(f"{DECK}/cards/{new['id']}", json={"group_id": "zzz"}).status_code == 404
    assert client.patch(f"{DECK}/cards/{new['id']}", json={"front": "  "}).status_code == 422
    assert (
        client.post(
            f"{DECK}/cards", json={"group_id": "zzz", "front": "a", "back": "b"}
        ).status_code
        == 404
    )

    deck = client.delete(f"{DECK}/cards/{new['id']}").json()
    assert all(c["id"] != new["id"] for c in deck["cards"])
    assert client.delete(f"{DECK}/cards/{new['id']}").status_code == 404


def test_edits_persist_to_disk(client: TestClient):
    client.post(f"{DECK}/groups", json={"name": "Saved"})
    repo: DeckRepository = client.app.state.repo
    assert [g.name for g in repo.get("d00001").groups][-1] == "Saved"


# ---- generation ------------------------------------------------------------


def poll(client: TestClient, job_id: str) -> dict:
    return client.get(f"/api/jobs/{job_id}").json()


def test_generate_from_file_creates_deck(tmp_path: Path):
    client = make_client(tmp_path)
    resp = client.post(
        "/api/generate",
        data={"density": "light", "title": "My Deck"},
        files={"file": ("guide.md", (FIXTURES / "sample.md").read_bytes(), "text/markdown")},
    )
    assert resp.status_code == 202
    job = poll(client, resp.json()["job_id"])  # background task has run by now
    assert job["status"] == "succeeded", job
    assert job["current"] == job["total"] == 1
    deck = client.get(f"/api/decks/{job['deck_id']}").json()
    assert deck["title"] == "My Deck"
    assert deck["source"]["filename"] == "guide.md"
    assert len(deck["cards"]) == 2


def test_generate_from_pasted_text(tmp_path: Path):
    client = make_client(tmp_path)
    resp = client.post("/api/generate", data={"text": "# Topic\n\nfacts", "density": "standard"})
    job = poll(client, resp.json()["job_id"])
    assert job["status"] == "succeeded"
    deck = client.get(f"/api/decks/{job['deck_id']}").json()
    assert deck["title"] == "Pasted study guide"
    assert deck["source"]["type"] == "text"


def test_generate_input_validation(tmp_path: Path):
    client = make_client(tmp_path)
    assert client.post("/api/generate", data={"density": "standard"}).status_code == 400
    both = client.post(
        "/api/generate",
        data={"text": "x"},
        files={"file": ("a.txt", b"hello", "text/plain")},
    )
    assert both.status_code == 400
    assert client.post("/api/generate", data={"text": "x", "density": "huge"}).status_code == 422

    bad_type = client.post("/api/generate", files={"file": ("a.xyz", b"hello", "text/plain")})
    assert bad_type.status_code == 400 and "Unsupported" in bad_type.json()["detail"]

    scanned = client.post(
        "/api/generate", files={"file": ("s.pdf", (FIXTURES / "blank.pdf").read_bytes(), "x")}
    )
    assert scanned.status_code == 400 and "scanned PDF" in scanned.json()["detail"]

    too_big = client.post(
        "/api/generate", files={"file": ("big.txt", b"a" * (1024 * 1024 + 1), "text/plain")}
    )
    assert too_big.status_code == 413


def test_missing_api_key_only_blocks_generation(tmp_path: Path, sample_deck: Deck):
    client = make_client(tmp_path, api_key="")
    client.app.state.repo.save(sample_deck)
    assert client.get("/api/decks").status_code == 200
    assert client.get(DECK).status_code == 200
    assert client.patch(DECK, json={"title": "ok"}).status_code == 200
    resp = client.post("/api/generate", data={"text": "hello"})
    assert resp.status_code == 400
    assert "ANTHROPIC_API_KEY" in resp.json()["detail"]
    assert client.get("/api/config").json()["api_key_configured"] is False


def test_llm_failure_reported_on_job(tmp_path: Path):
    from app.llm.client import GenerationError

    client = make_client(
        tmp_path, generator=StubGenerator(GenerationError("Rate limited by Anthropic."))
    )
    job_id = client.post("/api/generate", data={"text": "hello"}).json()["job_id"]
    job = poll(client, job_id)
    assert job["status"] == "failed"
    assert job["error"] == "Rate limited by Anthropic."
    assert client.app.state.repo.list().decks == []


def test_unexpected_failure_has_generic_message(tmp_path: Path):
    client = make_client(tmp_path, generator=StubGenerator(RuntimeError("secret internals")))
    job_id = client.post("/api/generate", data={"text": "hello"}).json()["job_id"]
    job = poll(client, job_id)
    assert job["status"] == "failed"
    assert "secret internals" not in job["error"]


def test_unknown_job(tmp_path: Path):
    assert make_client(tmp_path).get("/api/jobs/nope").status_code == 404
