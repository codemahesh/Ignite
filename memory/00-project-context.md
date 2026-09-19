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

- **Postgres**: local Docker container, `pgvector` extension enabled, NOT Render Postgres. Connection via `DATABASE_URL` env var pointing at `localhost`.
- **Neo4j**: local Docker container (`neo4j:5-community` or similar with APOC if needed), NOT Neo4j Aura. Connection via `GRAPH_DATABASE_URL=bolt://localhost:7687`.
- **OpenAI (`LLM_API_KEY`)**: no real key available. All LLM-calling code (Cognee's own LLM calls, the contradiction judge, topic classification) must go through an interface/provider that can run in a **mock mode** returning deterministic canned responses when `LLM_API_KEY` is unset or `MOCK_LLM=true`. Never hard-fail startup just because the key is missing — degrade, log it, keep the rest of the system working, mirroring the architecture's own "non-blocking" philosophy.
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
