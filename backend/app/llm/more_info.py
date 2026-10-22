"""Result of a "give me more information" request, and extraction from a web-search response."""

from urllib.parse import urlparse

from pydantic import BaseModel

MAX_SOURCES = 5


class MoreInfoSource(BaseModel):
    title: str
    url: str


class MoreInfo(BaseModel):
    explanation: str
    sources: list[MoreInfoSource] = []


def _safe_url(url: object) -> str | None:
    """Only plain http(s) links are ever returned to the browser."""
    if not isinstance(url, str):
        return None
    parsed = urlparse(url.strip())
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return url.strip()
    return None


def _add_source(sources: dict[str, MoreInfoSource], url: object, title: object) -> None:
    safe = _safe_url(url)
    if safe and safe not in sources:
        label = title.strip() if isinstance(title, str) and title.strip() else urlparse(safe).netloc
        sources[safe] = MoreInfoSource(title=label, url=safe)


def extract_more_info(content_blocks: list) -> MoreInfo:
    """Collect the answer text and source links from response content blocks.

    Links the model actually cited come first; any other pages it found while searching follow.
    """
    text_parts: list[str] = []
    cited: dict[str, MoreInfoSource] = {}
    found: dict[str, MoreInfoSource] = {}

    for block in content_blocks:
        kind = getattr(block, "type", None)
        if kind == "text":
            text_parts.append(getattr(block, "text", "") or "")
            for citation in getattr(block, "citations", None) or []:
                _add_source(cited, getattr(citation, "url", None), getattr(citation, "title", None))
        elif kind == "web_search_tool_result":
            results = getattr(block, "content", None)
            if isinstance(results, list):  # an error result is an object, not a list
                for item in results:
                    _add_source(found, getattr(item, "url", None), getattr(item, "title", None))

    sources = list(cited.values())
    sources += [s for url, s in found.items() if url not in cited]
    explanation = "".join(text_parts).strip()
    return MoreInfo(explanation=explanation, sources=sources[:MAX_SOURCES])
