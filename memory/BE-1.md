# BE-1 — FastAPI skeleton

**Status: done. Verified by independent subagent.**

## What was built

- `backend/app/__init__.py` — empty, makes `app` a package.
- `backend/app/config.py` — `Settings(BaseSettings)` (pydantic-settings), currently just `frontend_origin` (default `http://localhost:3000`) and `admin_shared_secret` (for BE-34 later). Reads from `backend/.env`. `get_settings()` is `@lru_cache`d — import this, don't re-instantiate `Settings()` elsewhere.
- `backend/app/main.py` — `FastAPI(title="Company Brain API")`, `CORSMiddleware` wired to `[settings.frontend_origin]` (single origin, not `*`), `GET /health` returning `{"status": "ok"}`. **Deliberately has zero DB/cognee imports** — keep it that way; dependency checks belong in `/ready` (BE-3).
- `backend/start.sh` — canonical start command for local dev *and* future deploy: `uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1`. `--workers 1` is load-bearing (v1 §3: in-process job registry/cache would fragment across workers) — don't change without also externalizing that state.

## Local dev port

**Port 8000 is already occupied by an unrelated project on this machine.** The backend runs on **8010** locally via the `PORT` env var in `backend/.env` / `.env.example`. Any local dev command or doc referencing "the backend" should assume `http://localhost:8010`, not 8000. (On an actual Render deploy this doesn't matter — Render sets `PORT` itself.)

## How to run it

```
cd backend
source .venv/bin/activate
set -a && source .env && set +a
./start.sh
```

Health check: `curl http://localhost:8010/health`

## For downstream tasks

- **FE-1** should point `NEXT_PUBLIC_API_BASE_URL` at `http://localhost:8010`.
- **BE-3** (`GET /ready`) goes in `app/main.py` alongside `/health`, but unlike `/health` it's expected to import and check Postgres/Neo4j/cognee config.
- Any new route module should be included into the `app` FastAPI instance in `main.py` (no router-splitting yet — fine to keep everything in one file until it gets unwieldy; revisit if `main.py` grows past ~150 lines).
