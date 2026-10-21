import logging
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)

from app.config import Settings
from app.jobs import Job, JobStore
from app.llm.client import CardGenerator, GenerationError
from app.llm.pipeline import generate_deck
from app.llm.templates import Density
from app.parsers import ParsedDocument, ParseError, parse_file, parse_pasted
from app.routers.deps import get_jobs, get_repo, get_settings_dep
from app.routers.schemas import GenerateResponse
from app.storage import DeckRepository

log = logging.getLogger(__name__)

router = APIRouter(tags=["generate"])


def _run_job(
    job_id: str,
    jobs: JobStore,
    repo: DeckRepository,
    generator: CardGenerator,
    document: ParsedDocument,
    filename: str | None,
    title: str | None,
    density: Density,
) -> None:
    try:
        deck = generate_deck(
            document,
            filename=filename,
            title=title,
            density=density,
            generator=generator,
            repo=repo,
            on_progress=lambda current, total: jobs.progress(job_id, current, total),
        )
        jobs.succeed(job_id, deck.id)
    except GenerationError as exc:
        jobs.fail(job_id, str(exc))
    except Exception:
        log.exception("Generation job %s crashed", job_id)
        jobs.fail(job_id, "Something went wrong while generating the deck. See the server log.")


@router.post("/generate", response_model=GenerateResponse, status_code=202)
async def start_generation(
    request: Request,
    background: BackgroundTasks,
    density: Annotated[Density, Form()] = "standard",
    title: Annotated[str | None, Form()] = None,
    text: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
    jobs: JobStore = Depends(get_jobs),
    repo: DeckRepository = Depends(get_repo),
    settings: Settings = Depends(get_settings_dep),
) -> GenerateResponse:
    has_file = file is not None and bool(file.filename)
    has_text = bool(text and text.strip())
    if has_file == has_text:
        raise HTTPException(400, "Provide either a file or pasted text (not both, not neither).")

    filename: str | None = None
    try:
        if has_file:
            assert file is not None
            data = await file.read(settings.max_upload_bytes + 1)
            if len(data) > settings.max_upload_bytes:
                raise HTTPException(
                    413, f"File is larger than the {settings.max_upload_mb} MB limit."
                )
            filename = file.filename
            assert filename is not None
            document = parse_file(filename, data)
        else:
            assert text is not None
            document = parse_pasted(text)
    except ParseError as exc:
        raise HTTPException(400, str(exc)) from exc

    try:
        generator = request.app.state.generator_factory()
    except GenerationError as exc:
        raise HTTPException(400, str(exc)) from exc

    job = jobs.create()
    background.add_task(_run_job, job.id, jobs, repo, generator, document, filename, title, density)
    return GenerateResponse(job_id=job.id)


@router.get("/jobs/{job_id}", response_model=Job)
def get_job(job_id: str, jobs: JobStore = Depends(get_jobs)) -> Job:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found (the server may have restarted).")
    return job
