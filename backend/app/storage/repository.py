"""Deck repository: one pretty-printed JSON file per deck, written atomically."""

import contextlib
import json
import os
import re
import tempfile
import threading
from collections.abc import Callable
from pathlib import Path

from pydantic import ValidationError

from app.models import Deck, DeckList, DeckLoadError, DeckSummary

_LOAD_ERRORS = (ValidationError, OSError, UnicodeDecodeError)


class DeckNotFoundError(LookupError):
    def __init__(self, deck_id: str):
        super().__init__(f"Deck '{deck_id}' not found")
        self.deck_id = deck_id


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:60].strip("-") or "deck"


def serialize(deck: Deck) -> str:
    """Stable, diff-friendly JSON: model field order, 2-space indent, trailing newline."""
    data = deck.model_dump(mode="json")
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


class DeckRepository:
    def __init__(self, decks_dir: Path):
        self.decks_dir = Path(decks_dir)
        self.decks_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    # ---- reading ---------------------------------------------------------

    def _files(self) -> list[Path]:
        return sorted(self.decks_dir.glob("*.json"))

    @staticmethod
    def _load(path: Path) -> Deck:
        return Deck.model_validate_json(path.read_text(encoding="utf-8"))

    def list(self) -> DeckList:
        decks: list[DeckSummary] = []
        errors: list[DeckLoadError] = []
        with self._lock:
            for path in self._files():
                try:
                    decks.append(DeckSummary.from_deck(self._load(path)))
                except _LOAD_ERRORS as exc:
                    errors.append(DeckLoadError(filename=path.name, error=_short_error(exc)))
        decks.sort(key=lambda d: d.created_at, reverse=True)
        return DeckList(decks=decks, errors=errors)

    def _find_path(self, deck_id: str) -> Path | None:
        for path in self._files():
            try:
                if self._load(path).id == deck_id:
                    return path
            except _LOAD_ERRORS:
                continue
        return None

    def get(self, deck_id: str) -> Deck:
        with self._lock:
            path = self._find_path(deck_id)
            if path is None:
                raise DeckNotFoundError(deck_id)
            return self._load(path)

    def existing_ids(self) -> set[str]:
        ids: set[str] = set()
        with self._lock:
            for path in self._files():
                with contextlib.suppress(*_LOAD_ERRORS):
                    ids.add(self._load(path).id)
        return ids

    # ---- writing ---------------------------------------------------------

    def _unique_path(self, title: str) -> Path:
        base = slugify(title)
        path = self.decks_dir / f"{base}.json"
        n = 2
        while path.exists():
            path = self.decks_dir / f"{base}-{n}.json"
            n += 1
        return path

    def _write_atomic(self, path: Path, text: str) -> None:
        fd, tmp_name = tempfile.mkstemp(dir=self.decks_dir, prefix=".tmp-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(text)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, path)
        except BaseException:
            with contextlib.suppress(OSError):
                os.unlink(tmp_name)
            raise

    def save(self, deck: Deck) -> Deck:
        """Write the deck. Existing decks keep their filename; new ones get a slug."""
        # Re-validate so an invalid in-memory edit can never reach disk.
        deck = Deck.model_validate(deck.model_dump())
        with self._lock:
            path = self._find_path(deck.id) or self._unique_path(deck.title)
            self._write_atomic(path, serialize(deck))
        return deck

    def update(self, deck_id: str, mutate: Callable[[Deck], None]) -> Deck:
        """Read-modify-write under the lock. `mutate` edits the deck in place."""
        with self._lock:
            deck = self.get(deck_id)
            mutate(deck)
            deck.touch()
            return self.save(deck)

    def delete(self, deck_id: str) -> None:
        with self._lock:
            path = self._find_path(deck_id)
            if path is None:
                raise DeckNotFoundError(deck_id)
            path.unlink()


def _short_error(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        parts = []
        for err in exc.errors()[:3]:
            loc = ".".join(str(p) for p in err["loc"]) or "file"
            parts.append(f"{loc}: {err['msg']}")
        more = exc.error_count() - 3
        suffix = f" (+{more} more)" if more > 0 else ""
        return "; ".join(parts) + suffix
    return str(exc)
