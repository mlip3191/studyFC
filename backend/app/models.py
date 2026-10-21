"""Deck, Group and Card models. Field order here defines key order in the JSON files."""

import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    model_validator,
)

SCHEMA_VERSION = 1

CardType = Literal["qa", "term"]
SourceType = Literal["pdf", "docx", "pptx", "md", "txt", "text"]


def now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def new_id(existing: set[str] | None = None) -> str:
    """Short random id, unique within `existing`."""
    while True:
        candidate = uuid.uuid4().hex[:6]
        if not existing or candidate not in existing:
            return candidate


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


UtcDatetime = Annotated[datetime, AfterValidator(_to_utc)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_serializer("*", mode="wrap", when_used="json")
    def _serialize_datetimes(self, value, handler):
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%dT%H:%M:%SZ")
        return handler(value)


class Source(_Model):
    filename: str
    type: SourceType
    imported_at: UtcDatetime


class Group(_Model):
    id: str
    name: str = Field(min_length=1)
    order: int = 0


class Card(_Model):
    id: str
    group_id: str
    type: CardType = "qa"
    front: str = Field(min_length=1)
    back: str = Field(min_length=1)
    created_at: UtcDatetime = Field(default_factory=now)
    updated_at: UtcDatetime = Field(default_factory=now)


class Deck(_Model):
    schema_version: Literal[1] = SCHEMA_VERSION
    id: str
    title: str = Field(min_length=1)
    source: Source | None = None
    created_at: UtcDatetime = Field(default_factory=now)
    updated_at: UtcDatetime = Field(default_factory=now)
    groups: list[Group] = Field(default_factory=list)
    cards: list[Card] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_references(self) -> "Deck":
        group_ids = [g.id for g in self.groups]
        if len(set(group_ids)) != len(group_ids):
            raise ValueError("duplicate group ids")
        card_ids = [c.id for c in self.cards]
        if len(set(card_ids)) != len(card_ids):
            raise ValueError("duplicate card ids")
        known = set(group_ids)
        for card in self.cards:
            if card.group_id not in known:
                raise ValueError(f"card {card.id} references unknown group {card.group_id}")
        return self

    def touch(self) -> None:
        self.updated_at = now()

    def group_by_id(self, group_id: str) -> Group | None:
        return next((g for g in self.groups if g.id == group_id), None)

    def card_by_id(self, card_id: str) -> Card | None:
        return next((c for c in self.cards if c.id == card_id), None)

    def all_ids(self) -> set[str]:
        return {self.id, *(g.id for g in self.groups), *(c.id for c in self.cards)}


class DeckSummary(_Model):
    id: str
    title: str
    group_count: int
    card_count: int
    source: Source | None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime

    @classmethod
    def from_deck(cls, deck: Deck) -> "DeckSummary":
        return cls(
            id=deck.id,
            title=deck.title,
            group_count=len(deck.groups),
            card_count=len(deck.cards),
            source=deck.source,
            created_at=deck.created_at,
            updated_at=deck.updated_at,
        )


class DeckLoadError(_Model):
    filename: str
    error: str


class DeckList(_Model):
    decks: list[DeckSummary]
    errors: list[DeckLoadError]
