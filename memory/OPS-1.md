# OPS-1 — Local infra provisioning

**Status: done (local-first deviation, verified by independent subagent).**

## What was built

- `docker-compose.yml` (repo root): `postgres` service using `pgvector/pgvector:pg16`, host port **5436** (not 5432 — that and 5433/5434/5435 were already bound by unrelated containers on this dev machine). Container name `company-brain-postgres`.
- **Neo4j runs via Homebrew, not Docker.** `docker pull` for *any* image (even `hello-world`) fails on this machine with `tls: failed to verify certificate: x509: certificate signed by unknown authority` when reaching `production.cloudfront.docker.com` — a machine-level TLS trust issue with Docker Desktop's VM (no proxy configured in macOS network settings; ghcr.io and pypi.org both work fine, so it's specific to Docker Hub's CDN). Postgres only worked because that image was already cached locally from an unrelated project.
  - Installed via `brew install neo4j` (pulls from ghcr.io, unaffected). Version installed: **2026.08.1 community**.
  - Password set before first start: `neo4j-admin dbms set-initial-password local_dev_password` (must run before first `neo4j start` — cannot be changed this way afterward).
  - Running as a background service: `brew services start neo4j` / `brew services list` to check / `brew services stop neo4j` to stop.
  - Bolt: `bolt://localhost:7687`. HTTP browser: `http://localhost:7474`.
  - The `docker-compose.yml`'s `neo4j` service definition is left in place (harmless, unused locally) so the compose file stays correct for any environment where Docker Hub actually works.
- `backend/.venv` — Python **3.11.15** venv (project Python 3.9.6 is too old; cognee requires `>=3.10,<3.15`). Homebrew python at `/opt/homebrew/bin/python3.11`.
- `backend/requirements.txt` — key pins: `cognee[postgres-binary,neo4j]==1.6.0`, `fastapi>=0.116.2`, `sqlalchemy>=2.0.39` (cognee 1.6.0's actual floor; below that pip's resolver fails). Full transitive install succeeded.
- `backend/.env.example` + `backend/.env` (gitignored) — see below for the exact vars and why.
- `backend/scripts/verify_infra.py` — connects to Postgres (psycopg2, `CREATE EXTENSION IF NOT EXISTS vector`), Neo4j (neo4j driver, `RETURN 1`), and runs `cognee.prune.prune_data()` + `cognee.prune.prune_system(metadata=True)`. Run with:
  ```
  cd backend && source .venv/bin/activate && set -a && source .env && set +a && python3 scripts/verify_infra.py
  ```

## Critical discovery: cognee 1.6.0 API differs from what the architecture docs assumed

The architecture docs were written against an older cognee. The installed version (**1.6.0**, not the ~0.1.x implied by the docs) changed things:

1. **`cognee.prune.prune_data()` and `cognee.prune.prune_system(metadata=True)` still exist and work as documented** — good, no change needed there. Both are `async def`, must be awaited.
2. **Multi-tenant auth is ON by default.** Startup log: `"Multi-user access control on by default (ENABLE_BACKEND_ACCESS_CONTROL=false to disable)"`. This changes how the pgvector adapter resolves its connection (see #3). **Added `ENABLE_BACKEND_ACCESS_CONTROL=false` to `.env`** — matches the architecture's own single-tenant scope (v2 §5.3: "seam exists, single tenant implemented"). Confirmed via log line: `auth posture: authentication=disabled, multi_tenant=disabled`.
3. **`VECTOR_DB_*` env vars are separate from `DB_*` and are NOT auto-derived from them when access control is enabled.** Read `cognee/infrastructure/databases/vector/create_vector_engine.py`: with `ENABLE_BACKEND_ACCESS_CONTROL` on (the default), pgvector requires `vector_db_username/host/port/name` to be set explicitly or it raises `OSError("Missing required pgvector credentials.")`. With it *off*, it falls back to the relational `DB_*` values. **We set both** (`VECTOR_DB_HOST/PORT/NAME/USERNAME/PASSWORD` mirroring `DB_*`) so it works regardless of that flag's default in any future cognee version.
4. **Env var names for `DB_*` and `GRAPH_DATABASE_*` are unchanged** — confirmed by reading `RelationalConfig`/`GraphConfig` (both `pydantic_settings.BaseSettings`, env var = field name uppercased, no prefix). The architecture doc's names (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `DB_PROVIDER`, `GRAPH_DATABASE_PROVIDER/URL/USERNAME/PASSWORD`) all still apply as-is.
5. **A fresh Postgres will log a caught (non-fatal) warning on first `prune_data()`**: `relation "pipeline_runs" does not exist`. This is cognee's own internal telemetry (`record_operation`) trying to log the prune call to a table that only gets created lazily by cognee's own `add`/`cognify` pipeline machinery, not by `prune`. Cognee catches this itself, logs a `warning`, and continues — confirmed the script still exits 0 and prints all `[OK]` lines after it. **BE-2 / whatever first calls `cognee.add()` or `cognee.cognify()` should expect this table (and friends) to get created then** — don't be surprised by it, and don't try to pre-create `pipeline_runs` ourselves; let cognee own that table.
6. Cognee 1.6.0 also ships a `cognee doctor` CLI command ("Diagnose configuration and local services") — worth using ad hoc for debugging in later tasks, not wired into anything here.

## Exact `backend/.env` contents (gitignored; `.env.example` is committed and matches except for real values)

```
LLM_API_KEY=                  # blank — stubbed, see MOCK_LLM
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
MOCK_LLM=true                 # our own flag, not cognee's — see note below

GRAPH_DATABASE_PROVIDER=neo4j
GRAPH_DATABASE_URL=bolt://localhost:7687
GRAPH_DATABASE_USERNAME=neo4j
GRAPH_DATABASE_PASSWORD=local_dev_password

DB_PROVIDER=postgres
VECTOR_DB_PROVIDER=pgvector
DB_HOST=localhost
DB_PORT=5436
DB_NAME=company_brain
DB_USERNAME=cognee
DB_PASSWORD=cognee_local_dev
DATABASE_URL=postgresql://cognee:cognee_local_dev@localhost:5436/company_brain
VECTOR_DB_HOST=localhost
VECTOR_DB_PORT=5436
VECTOR_DB_NAME=company_brain
VECTOR_DB_USERNAME=cognee
VECTOR_DB_PASSWORD=cognee_local_dev
ENABLE_BACKEND_ACCESS_CONTROL=false

TAVILY_API_KEY=                # blank — stubbed
CREDENTIAL_ENCRYPTION_KEY=1DCegSP9vC3fnaUbLXJFl_eNlhB8RqRLiiH9hP4mSjk=   # real Fernet key, local-dev only
ADMIN_SHARED_SECRET=local-dev-secret
FRONTEND_ORIGIN=http://localhost:3000
```

**`MOCK_LLM=true` is a flag *we* define, not cognee's** — cognee itself has no such switch; if `LLM_API_KEY` is blank and cognee code actually tries to call an LLM (cognify, contradiction judge, topic classification), it will fail. Whichever task first wires an LLM call (BE-8 cognify, BE-14 contradiction judge, BE-29 topic classification) **must check `MOCK_LLM` itself and route through a deterministic mock provider** — this doesn't exist yet, it's a TODO for those tasks. Prune doesn't touch the LLM, so OPS-1 didn't need to build it.

## For downstream tasks

- Postgres is reachable at `localhost:5436`, already has the `vector` extension enabled.
- Neo4j is reachable at `bolt://localhost:7687`, empty graph (fresh install).
- `backend/.venv` (Python 3.11) has all deps installed — `source backend/.venv/bin/activate` before running anything backend-related.
- To restart infra after a machine reboot: `docker compose up -d postgres` (from repo root) + `brew services start neo4j`.
- BE-2 (Postgres schema) will create our own tables (`artifacts`, `watermarks`, `jobs`, `dead_letters`, `connectors`) in the same `company_brain` database — cognee's own tables (`pipeline_runs` etc.) will coexist there once BE-8 runs its first `add`/`cognify`. No naming collisions expected, but worth a glance at cognee's actual table names before finalizing BE-2's migration if any name looks close.
