# BE-3 — GET /ready

**Status: done. Verified by independent subagent (including live failure-injection test).**

## What was built

- `backend/app/readiness.py` — three sync check functions (`check_postgres`, `check_neo4j`, `check_cognee_config`), each returning `(ok: bool, error: str | None)`. Deliberately sync, not async — run via `asyncio.to_thread` from the route so they don't block the event loop, but keeping them sync means they're trivially unit-testable and reusable from a script (e.g. a future CLI diagnostic) without an event loop.
- `check_cognee_config` — checks `REQUIRED_COGNEE_VARS` are all set (non-empty). **This is a config-presence check, not a live cognee call** — a live `cognee.search()`/`cognee.add()` would just re-test Postgres/Neo4j reachability a second time through a slower path. `REQUIRED_COGNEE_VARS` now includes the full `DB_*`, `VECTOR_DB_*` (all 5 — `PROVIDER` alone isn't enough, added `HOST/PORT/NAME/USERNAME/PASSWORD` after independent review caught the gap), and `GRAPH_DATABASE_*` vars — matches exactly what cognee 1.6.0 actually reads per memory/OPS-1.md.
- `GET /ready` in `app/main.py` — runs all three checks concurrently (`asyncio.gather` + `asyncio.to_thread`), returns `200` only if all three pass, else `503` with per-dependency `{ok, error}` detail so a human can see exactly what's down without digging through logs.
- **`/health` was NOT touched** — still zero imports from `readiness.py`, confirmed by independent review. This is the point of the task: `/ready` can be slow/fail without affecting the keep-warm pinger's target.

## Verified live (not just declared)

Independent subagent deliberately stopped Neo4j (`brew services stop neo4j`) mid-test and confirmed: `/ready` → 503 with `neo4j.ok:false` and a real connection-refused error message, `postgres`/`cognee_config` still `ok:true`, and **`/health` stayed 200 throughout** (isolation proven, not assumed). Neo4j was restarted and confirmed back to 200 before the subagent finished — infra was left in a good state for later tasks.

## For downstream tasks

- `/ready` is for **manual use before the demo** (per the task's own acceptance criterion) — do not wire it into OPS-2's pinger or any automated health monitor. If a future task wants automated dependency alerting, that's a new, separate concern.
- If a 6th dependency gets added later (e.g. Tavily reachability), add a `check_tavily()` following the same `(bool, str | None)` pattern and slot it into the `asyncio.gather` call — don't invent a different shape.
