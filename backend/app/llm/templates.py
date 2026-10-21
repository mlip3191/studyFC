"""Loads prompt templates from `prompts/*.md`. Edit those files to tune generation."""

import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

PROMPTS_DIR = Path(__file__).parent / "prompts"

Density = Literal["light", "standard", "exhaustive"]
DENSITIES: tuple[Density, ...] = ("light", "standard", "exhaustive")


@lru_cache
def _read(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8").strip()


def system_prompt() -> str:
    return _read("system.md")


def density_guidance(density: Density) -> str:
    return _read(f"density_{density}.md")


def _existing_groups_block(group_names: list[str]) -> str:
    if not group_names:
        return "No groups exist yet. Create groups as you need them."
    listing = "\n".join(f"- {name}" for name in group_names)
    return (
        "Groups created so far (reuse these exact names when a card fits one, "
        "instead of making near-duplicates):\n" + listing
    )


def user_prompt(
    *,
    chunk_text: str,
    chunk_number: int,
    chunk_total: int,
    density: Density,
    group_names: list[str],
) -> str:
    values = {
        "density_guidance": density_guidance(density),
        "chunk_number": str(chunk_number),
        "chunk_total": str(chunk_total),
        "existing_groups": _existing_groups_block(group_names),
        "document_text": chunk_text,
    }
    template = _read("chunk_user.md")
    # Single pass so placeholder-like text inside the document is never substituted.
    return re.sub(r"\{\{(\w+)\}\}", lambda m: values.get(m.group(1), m.group(0)), template)
