"""Split a document into chunks along section boundaries.

Sections start at Markdown `#` heading lines (the parsers emit those). Whole sections are
packed greedily into chunks of at most `max_chars`. A section is only split when it is too
large on its own, and then on paragraph boundaries, repeating its heading for context.
"""

import re
from dataclasses import dataclass

# Roughly 4 characters per token; ~10k tokens per chunk keeps requests well inside any context.
DEFAULT_MAX_CHARS = 40_000

_HEADING_RE = re.compile(r"^#{1,6}\s+\S")


@dataclass(frozen=True)
class Section:
    heading: str  # the heading line, or "" for text before the first heading
    text: str  # full section text including the heading line


def split_sections(text: str) -> list[Section]:
    sections: list[Section] = []
    heading = ""
    lines: list[str] = []
    in_fence = False

    def flush() -> None:
        body = "\n".join(lines).strip()
        if body:
            sections.append(Section(heading=heading, text=body))

    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        if not in_fence and _HEADING_RE.match(line):
            flush()
            heading = line.strip()
            lines = [line]
        else:
            lines.append(line)
    flush()
    return sections


def _hard_split(text: str, max_chars: int) -> list[str]:
    """Last resort for a single paragraph longer than max_chars: split on lines, then chars."""
    pieces: list[str] = []
    current = ""
    for line in text.split("\n"):
        while len(line) > max_chars:
            if current:
                pieces.append(current)
                current = ""
            pieces.append(line[:max_chars])
            line = line[max_chars:]
        if current and len(current) + len(line) + 1 > max_chars:
            pieces.append(current)
            current = line
        else:
            current = f"{current}\n{line}" if current else line
    if current:
        pieces.append(current)
    return pieces


def split_oversize(section: Section, max_chars: int) -> list[str]:
    """Split one section on paragraph boundaries; later pieces repeat the heading."""
    prefix = f"{section.heading} (continued)\n\n" if section.heading else ""
    budget = max(max_chars - len(prefix), max_chars // 2)

    paragraphs: list[str] = []
    for para in re.split(r"\n\s*\n", section.text):
        paragraphs.extend(_hard_split(para, budget) if len(para) > budget else [para])

    pieces: list[str] = []
    current = ""
    for para in paragraphs:
        candidate = f"{current}\n\n{para}" if current else para
        if current and len(candidate) > budget:
            pieces.append(current)
            current = para
        else:
            current = candidate
    if current:
        pieces.append(current)

    return [pieces[0]] + [prefix + piece for piece in pieces[1:]]


def chunk_document(text: str, max_chars: int = DEFAULT_MAX_CHARS) -> list[str]:
    chunks: list[str] = []
    current = ""
    for section in split_sections(text):
        if len(section.text) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(split_oversize(section, max_chars))
            continue
        candidate = f"{current}\n\n{section.text}" if current else section.text
        if current and len(candidate) > max_chars:
            chunks.append(current)
            current = section.text
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def split_in_half(chunk: str) -> list[str]:
    """Used when a response is truncated: split a chunk near its middle paragraph break."""
    paragraphs = re.split(r"\n\s*\n", chunk)
    if len(paragraphs) < 2:
        mid = len(chunk) // 2
        return [chunk[:mid], chunk[mid:]]
    target = len(chunk) / 2
    running = 0
    for i, para in enumerate(paragraphs[:-1]):
        running += len(para) + 2
        if running >= target:
            return ["\n\n".join(paragraphs[: i + 1]), "\n\n".join(paragraphs[i + 1 :])]
    return ["\n\n".join(paragraphs[:-1]), paragraphs[-1]]
