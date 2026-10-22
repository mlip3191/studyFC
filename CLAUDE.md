# Notes for Claude Code

Local web app: study guide (PDF/docx/pptx/md/text) → flashcards via the Claude API, grouped by topic, studied in the browser. Public repo; decks are committed JSON files.

## Layout

- `backend/app/` FastAPI. `models.py` (Pydantic Deck/Group/Card; field order = JSON key order), `storage/repository.py` (one JSON file per deck, atomic writes, per-process lock), `parsers/` (registry by extension, emit Markdown-style `#` headings), `llm/` (`chunking.py`, `merge.py` group-name normalization + card dedup, `client.py` Anthropic wrapper, `pipeline.py`, `prompts/*.md`), `routers/`, `jobs.py` (in-memory job store).
- `frontend/src/` React Router pages in `pages/`, reusable pieces in `components/`, typed API client in `lib/api.ts` (mirror types in `lib/types.ts`), pure study logic in `lib/study.ts`.
- `decks/` committed deck files. Never store study progress there.

## Commands

```bash
cd backend  && uv run pytest -q && uv run ruff check . && uv run ruff format --check .
cd frontend && npm test && npm run lint && npm run format:check && npm run typecheck
make dev        # backend :8000 (reload) + frontend :5173 (proxies /api)
docker compose up --build   # http://localhost:8080
```

## Conventions and gotchas

- **No real API calls in tests.** Inject a fake generator via `create_app(settings, generator_factory=...)` or a fake SDK into `ClaudeClient(client=...)`.
- Missing `ANTHROPIC_API_KEY` must only block generation (`POST /api/generate` returns 400 with a clear message); everything else works.
- Generation request is parsed synchronously (clear 400s for bad/scanned files), the LLM work runs as a background job polled via `GET /api/jobs/{id}`.
- Newer Claude models reject forced `tool_choice`; the client uses `auto` plus a `strict` tool and the prompt tells the model to call `submit_flashcards`.
- "More information" (`ClaudeClient.explain`, `llm/more_info.py`) uses the web search server tool; `pause_turn` is resumed in a loop, and sources come from citations first, search results second (http/https only). It falls back to no-search if the tool is rejected. Results are never stored.
- All deck mutations go through `DeckRepository.update` (read-modify-write under a lock) and return the full updated `Deck`.
- Deck file format changes need a `schema_version` bump and a migration path. Keep key order stable so git diffs stay clean.
- Prompt text lives only in `backend/app/llm/prompts/`; templates use `{{placeholder}}` and are cached with `lru_cache`.
- Frontend: Tailwind v4, 44px minimum tap targets, dark mode via `dark` class on `<html>` (preference in localStorage). The React hooks ESLint rules forbid synchronous `setState` in effects, so fetch with `.then` inside the effect.
- Ask before adding dependencies. Line endings are LF (`.gitattributes`).
- `.env` is gitignored; `decks/` must never be.
