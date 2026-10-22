# Study Guide → Flashcards

Turn a study guide, cheat sheet or set of lecture notes into topic-grouped flashcards with the Claude API, then study just the topics you pick, in your browser.

![Screenshot placeholder](docs/screenshot.png)

- Upload a **PDF, .docx, .pptx, Markdown or text file**, or paste text.
- Claude extracts flashcards and sorts them into topic groups it infers from the content.
- Each study guide becomes a **deck**: one pretty-printed JSON file in `decks/`, easy to commit and diff.
- Pick one or more groups with checkboxes, then study them. Edit any card or group at any time.
- No database, no accounts, no saved study history. Everything is local.

A small sample deck (`decks/solar-system-basics.json`) ships with the repo, so you can browse, edit and study right after cloning, before adding an API key.

## Quick start (Docker)

```bash
cp .env.example .env        # then put your ANTHROPIC_API_KEY in .env
docker compose up --build   # full step-by-step: see "Deploy" below
```

Open <http://localhost:8080>. From a phone on the same network, use `http://<your-computer-ip>:8080`.

`./decks` is mounted into the container, so decks you create are plain files in your repo. The app works without an API key; only generating new decks needs one.

## Deploy: step by step

These are the exact steps to run the app on any machine (your computer, a home server or a VM) with Docker.

**1. Install the requirements**

- [Git](https://git-scm.com/downloads)
- [Docker](https://docs.docker.com/get-docker/) with Compose v2 (Docker Desktop on Windows/macOS includes it). Make sure it is running: `docker info` should print without errors.

**2. Get the code**

```bash
git clone https://github.com/mlip3191/studyFC.git
cd studyFC
```

**3. Create your `.env` file** (this is where the API keys go; it is gitignored)

```bash
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Open `.env` in a text editor and replace the placeholder values:

| Line in `.env`                         | What to put there                                                              | Used by the app? |
| -------------------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| `ANTHROPIC_API_KEY=your-anthropic-api-key-here` | Your key from <https://console.anthropic.com/> (API keys). Starts with `sk-ant-`. | **Yes, required to generate decks** |
| `OPENAI_API_KEY=your-openai-api-key-here`       | OpenAI key (<https://platform.openai.com/api-keys>)                           | No, placeholder  |
| `XAI_API_KEY=your-xai-grok-api-key-here`        | xAI Grok key (<https://console.x.ai/>)                                        | No, placeholder  |
| `GEMINI_API_KEY=your-google-gemini-api-key-here`| Google Gemini key (<https://aistudio.google.com/apikey>)                      | No, placeholder  |

Only the Anthropic (Claude) key does anything today. The OpenAI, Grok and Gemini lines are placeholders for future support; the app ignores them, so you can leave them as they are or delete them. Put the value right after the `=` with no quotes or spaces, for example `ANTHROPIC_API_KEY=sk-ant-...`.

Without an Anthropic key the app still starts: you can browse, edit and study decks, but generating a new deck (or "Give more information") shows a clear error.

**4. Build and start**

```bash
docker compose up -d --build
```

The first build takes a few minutes. Check that it is healthy:

```bash
docker compose ps                      # both services should be "Up"
curl http://localhost:8080/api/health  # {"status":"ok"}
```

**5. Open the app** at <http://localhost:8080>. On a phone or another computer on the same network, use `http://<the-host-ip>:8080` and allow port 8080 in the host's firewall if needed.

**Everyday commands**

```bash
docker compose logs -f backend        # watch the backend log
docker compose down                   # stop
git pull && docker compose up -d --build   # update to the latest version
```

After editing `.env`, run `docker compose up -d` again so the backend picks up the new values.

Your decks are the JSON files in `./decks` (mounted into the container), so they survive rebuilds. Back that folder up if the decks matter to you.

**Security notes**

- The app has **no login**. Run it on your own computer or a private network. Do not expose port 8080 to the public internet unless you put it behind authentication (a VPN such as Tailscale, or a reverse proxy with auth).
- Anyone who can open the app can use your Anthropic key to generate decks, which costs money.
- Never commit `.env`. If a key leaks, revoke it in the provider's console and create a new one.

## Development setup

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/), Node 20+ (22 recommended).

```bash
cp .env.example .env
# Terminal 1: backend with auto-reload on :8000
cd backend && uv run uvicorn app.main:app --reload
# Terminal 2: frontend (Vite, proxies /api to :8000) on :5173
cd frontend && npm install && npm run dev
```

Or use a helper that starts both: `make dev`, `./scripts/dev.sh`, or `scripts\dev.ps1` on Windows.

Vite listens on all interfaces, so you can open `http://<your-computer-ip>:5173` on a phone while developing.

Checks (the same ones CI runs):

```bash
make check      # or, individually:
cd backend  && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm test
```

## Getting an Anthropic API key

1. Create an account at <https://console.anthropic.com/>.
2. Add credit under Billing, then create a key under **API keys**.
3. Put it in `.env` as `ANTHROPIC_API_KEY=...` and restart the app. `.env` is gitignored; never commit it.

Configuration (`.env`):

| Variable            | Default             | Meaning                                                   |
| ------------------- | ------------------- | --------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | _(empty)_           | Needed only to generate decks                             |
| `ANTHROPIC_MODEL`   | `claude-sonnet-5-5` | Model used for generation                                 |
| `DECKS_DIR`         | `./decks`           | Where deck JSON files live (relative paths: from repo root) |
| `MAX_UPLOAD_MB`     | `25`                | Upload size limit                                         |

## Supported files and limits

| Type            | Notes                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `.pdf`          | Needs a text layer. Headings are detected from font size. **Scanned PDFs are not supported** (no OCR). |
| `.docx`         | Heading styles become topics. Tables are flattened to `a \| b` rows.                            |
| `.pptx`         | Slide titles become headings; body text and **speaker notes** are included. **Images in slides are ignored.** |
| `.md`, `.txt`   | `#` headings become topics.                                                                    |
| Pasted text     | Treated like Markdown.                                                                         |

Images, charts and diagrams inside any file are ignored. Very long documents are split along section boundaries and processed in several requests; the UI shows "Processing section 2 of 5".

## Density settings

Chosen per upload:

- **Light**: key concepts only.
- **Standard**: key concepts plus important supporting facts and examples.
- **Exhaustive**: every testable fact.

The wording for each level is in `backend/app/llm/prompts/density_*.md`.

## Deck JSON format

One file per deck at `decks/<slug>.json`, pretty-printed (2-space indent, stable key order), written atomically, with short stable IDs so git diffs stay small. Study progress is never stored in deck files.

```json
{
  "schema_version": 1,
  "id": "a1b2c3",
  "title": "Solar System Basics",
  "source": { "filename": "solar-system.md", "type": "md", "imported_at": "2026-10-21T20:00:00Z" },
  "created_at": "2026-10-21T20:00:00Z",
  "updated_at": "2026-10-21T20:00:00Z",
  "groups": [{ "id": "g1", "name": "Inner Planets", "order": 0 }],
  "cards": [
    {
      "id": "c1",
      "group_id": "g1",
      "type": "qa",
      "front": "Which planet is closest to the Sun?",
      "back": "Mercury.",
      "created_at": "2026-10-21T20:00:00Z",
      "updated_at": "2026-10-21T20:00:00Z"
    }
  ]
}
```

Card `type` is `qa` (question → answer) or `term` (term → definition; can be studied in either direction). Files are validated on load; an invalid file shows up as an error in the deck list instead of breaking the app.

## More information on a card

Every card has a **Give more information** button, in the deck editor and on the answer side while studying. It asks Claude for a short explanation of the card's topic, using web search, and shows clickable links to the sources it found (they open in a new tab).

- Needs `ANTHROPIC_API_KEY`. Each click is one extra API request (a few cents at most, more when it searches).
- Web search must be enabled for your organization in the Anthropic Console. If it isn't, you still get an explanation, just without links.
- The explanation is AI-generated and can go beyond your study guide, so it is labeled as such. Nothing is saved to the deck.
- Its prompts are `backend/app/llm/prompts/more_info_*.md`.

## Tuning the prompts

All prompt text lives in `backend/app/llm/prompts/` as plain Markdown:

- `system.md`: card-quality and grouping rules.
- `density_light.md`, `density_standard.md`, `density_exhaustive.md`: guidance per density.
- `chunk_user.md`: the per-section request. Placeholders look like `{{density_guidance}}`, `{{existing_groups}}`, `{{chunk_number}}`, `{{chunk_total}}`, `{{document_text}}`.

Edit and restart the backend (templates are cached at startup). Output is returned through a tool call with a strict schema (`type`, `front`, `back`, `group_name`).

## Rough API cost

Using the default model (`claude-sonnet-5-5`, $2 per million input tokens and $10 per million output tokens at the time of writing; check current pricing). These are estimates, not guarantees:

| Study guide                  | Approx. cost (standard density) |
| ---------------------------- | ------------------------------- |
| 5-page cheat sheet           | a few cents                     |
| 20-page guide                | ~$0.05 to $0.25                 |
| 100-page textbook chapter set | ~$0.30 to $1.50                 |

Exhaustive density produces more cards, so it costs more (output tokens dominate). Light is cheapest. Model "thinking" tokens are billed as output.

## API

REST under `/api` (interactive docs at `/api/docs` when running the backend directly): `GET/PATCH/DELETE /decks/{id}`, groups and cards under `/decks/{id}/groups` and `/decks/{id}/cards`, `POST /decks/{id}/cards/{cid}/more-info`, `POST /generate`, `GET /jobs/{id}`, `GET /health`, `GET /config`.

## Project layout

```
backend/    FastAPI app (parsers, LLM pipeline, storage, routers) and pytest tests
frontend/   React + TypeScript + Vite + Tailwind, Vitest tests; nginx in the Docker image
decks/      Deck JSON files (committed)
scripts/    Dev helpers
```

## License

Add a license of your choice before publishing.
