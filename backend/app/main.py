import logging
from collections.abc import Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.jobs import JobStore
from app.llm.client import CardGenerator, ClaudeClient
from app.routers import cards, decks, generate, groups, health
from app.storage import DeckNotFoundError, DeckRepository

log = logging.getLogger("flashcards")


def create_app(
    settings: Settings | None = None,
    generator_factory: Callable[[], CardGenerator] | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="Study Guide Flashcards", docs_url="/api/docs", openapi_url="/api/openapi.json"
    )

    app.state.settings = settings
    app.state.repo = DeckRepository(settings.resolved_decks_dir)
    app.state.jobs = JobStore()
    # Raises MissingApiKeyError (a GenerationError) when no key is set; only called on generate.
    app.state.generator_factory = generator_factory or (
        lambda: ClaudeClient(settings.anthropic_api_key, settings.anthropic_model)
    )

    if not settings.anthropic_api_key:
        log.warning(
            "ANTHROPIC_API_KEY is not set. Generating decks is disabled; "
            "browsing, editing and studying existing decks still works."
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DeckNotFoundError)
    async def _deck_not_found(_: Request, exc: DeckNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    for module in (health, decks, groups, cards, generate):
        app.include_router(module.router, prefix="/api")
    return app


app = create_app()
