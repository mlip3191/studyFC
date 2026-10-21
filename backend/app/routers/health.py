from fastapi import APIRouter, Depends

from app.config import Settings
from app.parsers import SUPPORTED_EXTENSIONS
from app.routers.deps import get_settings_dep
from app.routers.schemas import AppConfig

router = APIRouter(tags=["meta"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/config", response_model=AppConfig)
def app_config(settings: Settings = Depends(get_settings_dep)) -> AppConfig:
    return AppConfig(
        api_key_configured=bool(settings.anthropic_api_key),
        model=settings.anthropic_model,
        max_upload_mb=settings.max_upload_mb,
        supported_extensions=SUPPORTED_EXTENSIONS,
    )
