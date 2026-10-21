from pathlib import Path

import pytest

from app.models import Card, Deck, Group, Source, now
from app.storage import DeckRepository


@pytest.fixture
def repo(tmp_path: Path) -> DeckRepository:
    return DeckRepository(tmp_path / "decks")


@pytest.fixture
def sample_deck() -> Deck:
    return Deck(
        id="d00001",
        title="Sample Deck",
        source=Source(filename="s.md", type="md", imported_at=now()),
        groups=[Group(id="g1", name="One", order=0), Group(id="g2", name="Two", order=1)],
        cards=[
            Card(id="c1", group_id="g1", type="qa", front="Q1?", back="A1"),
            Card(id="c2", group_id="g1", type="term", front="Term", back="Definition"),
            Card(id="c3", group_id="g2", type="qa", front="Q3?", back="A3"),
        ],
    )
