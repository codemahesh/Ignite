# Project Context — Company Brain (PS-2)

This file is read by every task subagent before it starts work. Keep it current.

## Source of truth

- `tasks.md` — the task list, dependency order, acceptance criteria. Follow it exactly.
- `PS-2_Company_Brain_Architecture (1).md` — v1 architecture (system diagram, ingestion/query layer, API surface, env vars).
- `PS-2_Architecture_v2_Dynamic_Connectors.md` — v2 (supersedes v1 on connectors: registry, lifecycle state machine, circuit breaker, job queue).
- `PS-2_Architecture_Review.md` — fixes already folded into `tasks.md`; don't re-derive them.
- `wireframes.md` — frontend layout/state reference for Phase 5 (FE-*) tasks.

## Infra decision (locked 2026-09-19)

**Local-first, stubbed external keys.** User explicitly chose this over live cloud accounts. Consequences for every task:

- **Postgres**: local Docker container, `pgvector` extension enabled, NOT Render Postgres. Connection via `DATABASE_URL` env var pointing at `localhost:5436` (5432 was already taken by other projects on this machine — see memory/OPS-1.md).
- **Neo4j**: **Homebrew-installed, NOT Docker** (Docker Hub's CDN had a machine-level TLS trust failure — see memory/OPS-1.md). `bolt://localhost:7687`. **Requires the APOC plugin** — cognee's Neo4j adapter calls `apoc.create.addLabels` during cognify. Homebrew's Neo4j ships APOC Core in `$(brew --prefix neo4j)/libexec/labs/apoc-<version>-core.jar` but doesn't activate it — copy it into `libexec/plugins/` and add `dbms.security.procedures.unrestricted=apoc.*` to `libexec/conf/neo4j.conf`, then restart (`brew services restart neo4j`). Verify with `echo "RETURN apoc.version();" | cypher-shell -u neo4j -p local_dev_password`.
- **OpenAI (`LLM_API_KEY`)**: **CONFIRMED (2026-09-19, via BE-8): no mock layer needed at all.** cognee 1.6.0 has genuine, documented, zero-cost keyless local operation — when `LLM_API_KEY` is left **entirely unset** (not even blank, must be absent from `model_fields_set`; a blank string in `.env` behaves the same as absent here since pydantic-settings treats an empty value as "not configured" for this check), `cognee.cognify()` automatically routes to the **GLiNER demo extractor** (`cognee[gliner]` extra → `gliner2` package, ~550MB model, downloads once from HuggingFace on first use, then fully local/offline) instead of an LLM, and embeddings automatically use the local **fastembed** model (`BAAI/bge-small-en-v1.5`, ~67MB, also already a cognee dependency). **Verified end-to-end**: `cognee.add()` + `cognee.cognify()` on a real sentence produced correct entities/types in Neo4j with zero network calls to any LLM provider. See `cognee/modules/preflight/config_preflight.py` and `cognee/modules/cognify/config.py`'s `resolve_extractor` in the installed package for the source of truth — don't take this file's word for it if cognee gets upgraded, re-check.
  - **This only covers ingestion (cognify).** `cognee.search(SearchType.GRAPH_COMPLETION)` (BE-11, answer generation), the contradiction judge (BE-14), and topic classification (BE-29) need genuine freeform text generation, which GLiNER does not do — those tasks still need either a real `LLM_API_KEY` or a local **Ollama** setup (`brew install ollama`; cognee 1.6.0 has first-class Ollama support — `LOCAL_LLM_PROVIDERS = {"ollama", "llama_cpp"}` in `cognee/infrastructure/llm/config.py`, requires `LLM_PROVIDER`, `LLM_MODEL`, `LLM_ENDPOINT`, `LLM_API_KEY` **all** set together, an Ollama recommended model is `llama3.2`). **Not yet set up — revisit when BE-11 is reached, don't set up Ollama speculatively before then.**
  - **Extraction quality caveat**: cognee logs a one-time warning that GLiNER demo is "cognee's open-source local extraction" with narrower accuracy than the enterprise/LLM path. If BE-9's manual graph inspection finds the seed corpus's chain/contradiction didn't resolve well, the fallback per the architecture docs' own risk note is to rewrite the corpus denser/more explicit first — but also consider that switching cognify's extractor to `llm` via Ollama might resolve it, as a second fallback.
- **Tavily (`TAVILY_API_KEY`)**: same pattern — if unset, the web-search toggle in the UI is disabled with a reason (per wireframes.md §1.1), and the backend returns a clear "not configured" response rather than crashing.
- **Jira / real MCP connectors**: BE-23 (real Jira) cannot be completed against a live account. Implement the connector code fully (BE-20/21/22) and use the **local fixture MCP server (BE-24)** as the end-to-end proof instead. BE-23 stays `[~]` blocked with a note until the user supplies real Jira credentials.
- **OPS-1, OPS-2, OPS-3, OPS-4, OPS-5**: these assume a deployed Render environment and real uptime monitoring. Implement everything that's code/config (docker-compose, health/ready endpoints, a pinger *script* ready to point at a URL, the demo script text) but do NOT mark the task fully `[x]` if its acceptance criterion literally requires a live deployed URL — mark `[~]` with a note explaining exactly what's left for the user to do once they deploy.

## Local dev environment

- `docker-compose.yml` at repo root: `postgres` (with pgvector) + `neo4j` services.
- `backend/.env.example` and `frontend/.env.example` document every var from architecture §6, with local-dev defaults filled in and cloud-only vars (`LLM_API_KEY`, `TAVILY_API_KEY`) left blank with comments.
- Real `.env` files are gitignored (already covered by root `.gitignore`).

## Working conventions for every task

- Backend: Python, FastAPI, lives under `backend/`.
- Frontend: Next.js (TypeScript), lives under `frontend/`.
- Every task's implementation must be testable **without** real cloud credentials — use the mock/local stand-ins above.
- After finishing a task, write `memory/<task-id>.md` (e.g. `memory/BE-4.md`) with: what was built, key decisions/deviations from the spec and why, files touched, how it was tested, anything a later task needs to know (e.g. exact function signatures, table names, env var names).
- Update `tasks.md` status marker (`[x]` done / `[~]` blocked-on-user-action / `[!]` failed) immediately after each task — never batch.

## Task status shorthand used in this run

- `[x]` — implemented AND independently tested by a fresh subagent AND passed.
- `[~]` — blocked on something only the user can provide (real cloud account, real API key, manual browser step) — implementation done as far as possible, noted in `memory/<task-id>.md`.
- `[!]` — attempted, failed testing, needs rework.
