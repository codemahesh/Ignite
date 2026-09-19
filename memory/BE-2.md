# BE-2 — Postgres schema

**Status: done. Verified by independent subagent (including live FK-enforcement test).**

## What was built

- `backend/app/db.py` — `Base` (SQLAlchemy 2.0 `DeclarativeBase`), `engine`, `SessionLocal`. `_database_url()` prefers `DATABASE_URL`, falls back to assembling from `DB_HOST/PORT/NAME/USERNAME/PASSWORD` (same vars cognee reads — see memory/OPS-1.md). Import `SessionLocal` for a session, `engine` for anything needing a raw connection.
- `backend/app/models.py` — 5 SQLAlchemy models: `Connector`, `Artifact`, `Watermark`, `SyncJob`, `DeadLetter`. Each has a docstring saying exactly which doc section it's sourced from and any judgment call made — **read those docstrings before changing a column**, they explain *why* each shape is what it is, not just what it is.
- `backend/migrations/` — Alembic, initialized fresh. `env.py` was hand-edited (not stock) to: load `backend/.env` via `python-dotenv`, add `backend/` to `sys.path`, import `app.db.Base` + `app.models` (so autogenerate sees the tables), and override `sqlalchemy.url` from the `DATABASE_URL` env var at runtime (so `alembic.ini`'s placeholder URL is never actually used).
- Migration `c753346f2811_be_2_initial_schema.py` — creates all 5 tables. Applied to local Postgres; `alembic current` reports `c753346f2811 (head)`.

## Key facts for downstream tasks

- **`artifacts.connector_id` and `jobs.connector_id` are nullable**, with `ON DELETE CASCADE` FKs to `connectors.id`. Nullable because Phase 2 (seed ingestion, BE-7/BE-8) runs before Phase 4's connector registry (BE-22) exists — seed artifacts won't have a `connector_id` unless/until a seed catalog entry gets registered later. Don't add a `NOT NULL` constraint there without checking BE-8 first.
- **`dead_letters.connector_id` has NO foreign key** — this is deliberate and matches the architecture doc's literal SQL exactly (unlike `artifacts`/`jobs`, whose FKs *are* in the docs). Verified this is correct, not an oversight, during independent review. Don't "fix" it by adding a FK later.
- **`jobs`/`sync_jobs` has no literal SQL in either architecture doc** — only a field-list requirement (v1 §5: `status: queued|running|done|failed`; v2 §3.4/§6: `fetched/ingested/failed/state` persisted so a restart doesn't lose visibility). The model assembled from both: `status` (queued/running/done/failed), `fetched`/`ingested`/`failed` counters, `per_source` JSONB (for v1's aggregate seed/full-sync job's `SourceStatus[]`), `error`, `created_at`/`started_at`/`ended_at`. **BE-26 (per-connector sync jobs) should reuse this same table**, not create a second one — that's what it's shaped for.
- Connector lifecycle states go in `connectors.state` as plain text (no DB enum) — the state machine values are `AVAILABLE | VALIDATING | CONNECTED | FAILED | SYNCING | SYNCED | DEGRADED | DISABLED` per v2 §2.2. Enforce the state machine in application code (BE-22), not a DB constraint.
- `artifacts.topic` is nullable — BE-29 (topic classification) fills it post-ingest, don't expect it populated before then.

## How to run migrations

```
cd backend
source .venv/bin/activate
set -a && source .env && set +a
alembic upgrade head        # apply
alembic revision --autogenerate -m "..."   # after changing models.py
```

## Verified live (by the independent subagent, not just declared)

Inserted a real `connectors` row, then attempted an `artifacts` insert with a bogus `connector_id` — Postgres actually rejected it with a foreign key violation. The constraint is enforced, not just present in the migration file. Test rows were cleaned up afterward.
