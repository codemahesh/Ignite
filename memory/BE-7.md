# BE-7 — SeedFileConnector

**Status: done. Verified by independent subagent (mypy conformance + exact-list spot-check).**

## What was built

`backend/app/seed_connector.py` — `SeedFileConnector` class:
- `name: str = "seed"`
- `fetch(self, since: datetime | None) -> Iterable[Artifact]` — `since=None` returns `list(SEED_ARTIFACTS)` (all 6, BE-6); otherwise filters to `updated_at > since`.

Structurally satisfies `SourceConnector` (BE-4) — confirmed via mypy, not just eyeballed:
```python
def takes_connector(c: SourceConnector) -> None: ...
takes_connector(SeedFileConnector())  # mypy: no issues
```

Tests: `backend/tests/test_seed_connector.py` (5 tests) — full-fetch identity, field validity (non-empty strings, tz-aware datetimes), since-filter correctness at a real cutoff date (between the two leave-policy dates), far-future cutoff returns `[]`, `name`/`source` consistency.

## For downstream tasks

- **BE-8** (ingestion runner) is the first real caller: `SeedFileConnector().fetch(since=None)` → for each `Artifact`, use `write_artifact_file()` + `node_set_for()` from `app/artifact_resolver.py` (BE-5) → stage to Postgres `artifacts` table → `cognee.add()` → `cognee.cognify()`.
- This connector has **no I/O, no network, no failure modes** — it's pure in-memory filtering over a Python list. Don't add try/except or timeout handling here; that belongs to BE-21's `MCPConnector` (real network calls), not this one. Keep it this simple.
- If BE-6's corpus ever grows or changes, this connector needs no changes — it just re-reads `SEED_ARTIFACTS`.
