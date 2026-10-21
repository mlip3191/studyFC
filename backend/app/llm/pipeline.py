"""Text -> chunks -> Claude per chunk -> merged, saved deck."""

import logging
from collections.abc import Callable
from pathlib import PurePath

from app.llm.chunking import DEFAULT_MAX_CHARS, chunk_document, split_in_half
from app.llm.client import CardGenerator, GenerationError, TruncatedResponseError
from app.llm.merge import CardAccumulator
from app.llm.templates import Density
from app.models import Deck, Source, new_id, now
from app.parsers import ParsedDocument
from app.storage import DeckRepository

log = logging.getLogger(__name__)

ProgressCallback = Callable[[int, int], None]
MAX_SPLIT_DEPTH = 3


def default_title(filename: str | None) -> str:
    if filename:
        stem = PurePath(filename).stem.strip()
        if stem:
            return stem
    return "Pasted study guide"


def _run_chunk(
    generator: CardGenerator,
    acc: CardAccumulator,
    text: str,
    number: int,
    total: int,
    density: Density,
    depth: int = 0,
) -> None:
    try:
        cards = generator.generate(
            chunk_text=text,
            chunk_number=number,
            chunk_total=total,
            density=density,
            group_names=acc.group_names(),
        )
    except TruncatedResponseError:
        if depth >= MAX_SPLIT_DEPTH:
            raise GenerationError(
                "A section of the document produced too many cards to fit in one response. "
                "Try a lighter density setting."
            ) from None
        for half in split_in_half(text):
            _run_chunk(generator, acc, half, number, total, density, depth + 1)
        return
    acc.add(cards)


def generate_deck(
    document: ParsedDocument,
    *,
    filename: str | None,
    title: str | None,
    density: Density,
    generator: CardGenerator,
    repo: DeckRepository,
    on_progress: ProgressCallback | None = None,
    max_chunk_chars: int = DEFAULT_MAX_CHARS,
) -> Deck:
    chunks = chunk_document(document.text, max_chunk_chars)
    total = len(chunks)
    acc = CardAccumulator()

    for number, chunk in enumerate(chunks, start=1):
        if on_progress:
            on_progress(number, total)
        _run_chunk(generator, acc, chunk, number, total, density)

    groups, cards = acc.build()
    if not cards:
        raise GenerationError(
            "No flashcards could be generated from this document. "
            "Try a higher density setting or a document with more study content."
        )

    timestamp = now()
    deck = Deck(
        id=new_id(repo.existing_ids()),
        title=(title or "").strip() or default_title(filename),
        source=Source(
            filename=filename or "pasted text",
            type=document.source_type,
            imported_at=timestamp,
        ),
        created_at=timestamp,
        updated_at=timestamp,
        groups=groups,
        cards=cards,
    )
    return repo.save(deck)
