import codecs

from app.parsers.base import ParseError


def parse_text(data: bytes) -> str:
    if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return data.decode("utf-16")
    try:
        return data.decode("utf-8-sig")
    except UnicodeError:
        pass
    try:
        return data.decode("cp1252")
    except UnicodeError as exc:
        raise ParseError("Could not decode this file as text.") from exc
