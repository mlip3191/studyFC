"""Merge per-chunk results: normalize group names, merge near-duplicate groups, dedupe cards."""

import re
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, field_validator

from app.models import Card, CardType, Group, new_id

UNSORTED_GROUP = "General"


class RawCard(BaseModel):
    """One card as returned by the model."""

    type: Literal["qa", "term"] = "qa"
    front: str
    back: str
    group_name: str = UNSORTED_GROUP

    @field_validator("front", "back", "group_name", mode="before")
    @classmethod
    def _strip(cls, value):
        return " ".join(value.split()) if isinstance(value, str) else value


def normalize_name(name: str) -> str:
    """Display form: collapsed whitespace, no stray edge punctuation."""
    cleaned = " ".join(name.split()).strip(" \t-:;,.")
    return cleaned or UNSORTED_GROUP


def _singular(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and word.endswith(("sses", "xes", "ches", "shes")):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def group_key(name: str) -> str:
    """Comparison key: case, spacing, punctuation and plural differences all collapse."""
    text = name.lower().replace("&", " and ")
    text = re.sub(r"['’]s\b", "s", text)
    words = re.findall(r"[a-z0-9]+", text)
    return " ".join(_singular(w) for w in words)


def card_key(front: str) -> str:
    text = re.sub(r"[^\w\s]", "", front.lower())
    return " ".join(text.split())


@dataclass
class CardAccumulator:
    """Collects raw cards across chunks, reusing group names and dropping duplicate cards."""

    _group_names: dict[str, str] = field(default_factory=dict)  # key -> display name
    _cards: list[tuple[str, RawCard]] = field(default_factory=list)  # (group key, card)
    _seen_fronts: set[str] = field(default_factory=set)
    duplicates_dropped: int = 0

    def group_names(self) -> list[str]:
        return list(self._group_names.values())

    def add(self, cards: list[RawCard]) -> None:
        for raw in cards:
            if not raw.front or not raw.back:
                continue
            name = normalize_name(raw.group_name)
            gkey = group_key(name) or group_key(UNSORTED_GROUP)
            self._group_names.setdefault(gkey, name)
            fkey = card_key(raw.front)
            if fkey in self._seen_fronts:
                self.duplicates_dropped += 1
                continue
            self._seen_fronts.add(fkey)
            self._cards.append((gkey, raw))

    def build(self) -> tuple[list[Group], list[Card]]:
        """Groups ordered by first appearance; groups left with no cards are omitted."""
        used = {gkey for gkey, _ in self._cards}
        taken: set[str] = set()

        def fresh_id() -> str:
            value = new_id(taken)
            taken.add(value)
            return value

        group_ids: dict[str, str] = {}
        groups: list[Group] = []
        for gkey, name in self._group_names.items():
            if gkey in used:
                group_ids[gkey] = fresh_id()
                groups.append(Group(id=group_ids[gkey], name=name, order=len(groups)))
        cards = [
            Card(
                id=fresh_id(),
                group_id=group_ids[gkey],
                type=_card_type(raw.type),
                front=raw.front,
                back=raw.back,
            )
            for gkey, raw in self._cards
        ]
        return groups, cards


def _card_type(value: str) -> CardType:
    return "term" if value == "term" else "qa"
