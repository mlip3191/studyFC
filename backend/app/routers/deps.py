from fastapi import Request

from app.config import Settings
from app.jobs import JobStore
from app.storage import DeckRepository


def get_repo(request: Request) -> DeckRepository:
    return request.app.state.repo


def get_jobs(request: Request) -> JobStore:
    return request.app.state.jobs


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings
