"""In-memory registry of background generation jobs. Lost on restart, which is fine locally."""

import threading
import uuid
from collections import OrderedDict
from typing import Literal

from pydantic import BaseModel

JobStatus = Literal["queued", "running", "succeeded", "failed"]
MAX_JOBS = 100


class Job(BaseModel):
    id: str
    status: JobStatus = "queued"
    current: int = 0
    total: int = 0
    message: str = "Queued"
    deck_id: str | None = None
    error: str | None = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: OrderedDict[str, Job] = OrderedDict()
        self._lock = threading.Lock()

    def create(self) -> Job:
        job = Job(id=uuid.uuid4().hex[:12])
        with self._lock:
            self._jobs[job.id] = job
            while len(self._jobs) > MAX_JOBS:
                self._jobs.popitem(last=False)
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return job.model_copy() if job else None

    def _update(self, job_id: str, **changes) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                self._jobs[job_id] = job.model_copy(update=changes)

    def progress(self, job_id: str, current: int, total: int) -> None:
        self._update(
            job_id,
            status="running",
            current=current,
            total=total,
            message=f"Processing section {current} of {total}",
        )

    def succeed(self, job_id: str, deck_id: str) -> None:
        self._update(job_id, status="succeeded", deck_id=deck_id, message="Done")

    def fail(self, job_id: str, error: str) -> None:
        self._update(job_id, status="failed", error=error, message="Failed")
