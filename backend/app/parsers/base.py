from dataclasses import dataclass

from app.models import SourceType


class ParseError(ValueError):
    """The file could not be read; the message is safe to show to the user."""


class EmptyDocumentError(ParseError):
    """The file parsed but contained no extractable text."""


@dataclass(frozen=True)
class ParsedDocument:
    """Extracted text. Headings are emitted as Markdown `#` lines."""

    text: str
    source_type: SourceType


def clean(text: str) -> str:
    """Collapse runs of blank lines and strip trailing whitespace."""
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    out: list[str] = []
    blank = False
    for line in lines:
        if not line.strip():
            if not blank and out:
                out.append("")
            blank = True
        else:
            out.append(line)
            blank = False
    return "\n".join(out).strip()
