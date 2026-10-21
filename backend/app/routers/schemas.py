"""Request/response bodies for the REST API."""

from pydantic import BaseModel, Field

from app.models import CardType


class DeckPatch(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class GroupPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    order: int | None = Field(default=None, ge=0, description="New zero-based position.")


class GroupMerge(BaseModel):
    source_id: str
    target_id: str


class CardCreate(BaseModel):
    group_id: str
    type: CardType = "qa"
    front: str = Field(min_length=1)
    back: str = Field(min_length=1)


class CardPatch(BaseModel):
    front: str | None = Field(default=None, min_length=1)
    back: str | None = Field(default=None, min_length=1)
    type: CardType | None = None
    group_id: str | None = None


class GenerateResponse(BaseModel):
    job_id: str


class AppConfig(BaseModel):
    api_key_configured: bool
    model: str
    max_upload_mb: int
    supported_extensions: list[str]
