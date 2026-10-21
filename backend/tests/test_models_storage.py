import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models import Card, Deck, Group, new_id
from app.storage import DeckNotFoundError, DeckRepository


def test_new_id_is_short_and_avoids_collisions():
    assert len(new_id()) == 6
    taken = {new_id() for _ in range(50)}
    assert new_id(taken) not in taken


def test_card_must_reference_existing_group():
    with pytest.raises(ValidationError):
        Deck(
            id="d1",
            title="t",
            groups=[Group(id="g1", name="G")],
            cards=[Card(id="c1", group_id="nope", front="f", back="b")],
        )


def test_duplicate_ids_rejected():
    with pytest.raises(ValidationError):
        Deck(id="d1", title="t", groups=[Group(id="g", name="A"), Group(id="g", name="B")])


def test_round_trip(repo: DeckRepository, sample_deck: Deck):
    repo.save(sample_deck)
    assert repo.get(sample_deck.id) == sample_deck


def test_file_format_is_stable_and_pretty(repo: DeckRepository, sample_deck: Deck):
    repo.save(sample_deck)
    path = repo.decks_dir / "sample-deck.json"
    text = path.read_text(encoding="utf-8")
    assert text.endswith("}\n")
    assert '\n  "schema_version": 1,\n  "id": "d00001",' in text
    data = json.loads(text)
    assert list(data) == [
        "schema_version",
        "id",
        "title",
        "source",
        "created_at",
        "updated_at",
        "groups",
        "cards",
    ]
    assert list(data["cards"][0]) == [
        "id",
        "group_id",
        "type",
        "front",
        "back",
        "created_at",
        "updated_at",
    ]
    assert data["created_at"].endswith("Z")
    # saving twice yields byte-identical output
    repo.save(sample_deck)
    assert path.read_text(encoding="utf-8") == text


def test_existing_deck_keeps_filename_and_title_collisions_get_suffix(
    repo: DeckRepository, sample_deck: Deck
):
    repo.save(sample_deck)
    sample_deck.title = "Renamed"
    repo.save(sample_deck)
    assert [p.name for p in repo.decks_dir.glob("*.json")] == ["sample-deck.json"]

    other = sample_deck.model_copy(update={"id": "d00002", "title": "Sample Deck"})
    repo.save(other)
    assert sorted(p.name for p in repo.decks_dir.glob("*.json")) == [
        "sample-deck-2.json",
        "sample-deck.json",
    ]


def test_atomic_write_preserves_original_on_failure(
    repo: DeckRepository, sample_deck: Deck, monkeypatch: pytest.MonkeyPatch
):
    repo.save(sample_deck)
    path = repo.decks_dir / "sample-deck.json"
    before = path.read_text(encoding="utf-8")
    assert list(repo.decks_dir.glob(".tmp-*")) == []

    def boom(src, dst):
        raise OSError("disk exploded")

    monkeypatch.setattr("app.storage.repository.os.replace", boom)
    sample_deck.title = "Changed"
    with pytest.raises(OSError):
        repo.save(sample_deck)
    assert path.read_text(encoding="utf-8") == before
    assert list(repo.decks_dir.glob(".tmp-*")) == []


def test_invalid_files_are_reported_not_fatal(repo: DeckRepository, sample_deck: Deck):
    repo.save(sample_deck)
    (repo.decks_dir / "broken.json").write_text("{not json", encoding="utf-8")
    (repo.decks_dir / "bad-schema.json").write_text(
        json.dumps({"schema_version": 1, "id": "x"}), encoding="utf-8"
    )
    result = repo.list()
    assert [d.id for d in result.decks] == ["d00001"]
    assert {e.filename for e in result.errors} == {"broken.json", "bad-schema.json"}
    assert all(e.error for e in result.errors)
    assert repo.get("d00001").title == "Sample Deck"


def test_get_and_delete_missing(repo: DeckRepository):
    with pytest.raises(DeckNotFoundError):
        repo.get("nope")
    with pytest.raises(DeckNotFoundError):
        repo.delete("nope")


def test_delete(repo: DeckRepository, sample_deck: Deck):
    repo.save(sample_deck)
    repo.delete(sample_deck.id)
    assert repo.list().decks == []


def test_update_persists_and_touches_updated_at(repo: DeckRepository, sample_deck: Deck):
    repo.save(sample_deck)

    def rename(deck: Deck) -> None:
        deck.title = "New title"

    updated = repo.update(sample_deck.id, rename)
    assert updated.title == "New title"
    assert repo.get(sample_deck.id).title == "New title"
    assert updated.updated_at >= sample_deck.updated_at


def test_summary_counts(repo: DeckRepository, sample_deck: Deck):
    repo.save(sample_deck)
    summary = repo.list().decks[0]
    assert (summary.group_count, summary.card_count) == (2, 3)


def test_missing_dir_is_created(tmp_path: Path):
    repo = DeckRepository(tmp_path / "a" / "b")
    assert repo.list().decks == []
