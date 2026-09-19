# BE-8 — Ingestion runner

**Status: implemented, self-tested extensively. Independent verification in progress — see tasks.md for final status.**

This was the most involved task so far — three separate real bugs were found and fixed while building it, all specific to cognee 1.6.0's actual behavior (not anticipated from the architecture docs, which assumed an older version). Read this whole file before touching `app/ingestion.py`.

## What was built

- `backend/app/ingestion.py` — `ingest_artifacts(connector: SourceConnector, since) -> dict[str, int]`. For each fetched artifact: classify as `added` (new) / `updated` (content changed) / `unchanged` (same hash, already has a cognee doc) / `retried` (staged last run, `cognee_doc_id` never got set — crash recovery). Stage all classified rows to Postgres `artifacts` **before** calling cognee (commit happens first — a crash after this point loses nothing, a re-run just retries). Then: `added`/`retried` artifacts go through `cognee.add()`; `updated` artifacts (with a prior `cognee_doc_id`) go through `cognee.update()` instead (see deviation below). One `cognee.cognify(datasets=["company_brain"])` call for the whole batch at the end, only if any work happened.
- `backend/scripts/ingest_seed_corpus.py` — runs BE-6's real corpus through it. **This is also the tool for BE-9's graph inspection** — run it, then inspect Neo4j.
- `backend/tests/test_ingestion.py` — 2 pure unit tests (`content_hash_for`) + 1 consolidated integration test (`test_ingestion_lifecycle`) covering first-add → idempotent-rerun → content-change-update → since-filtering, run against the real local stack (no mocks).
- `backend/pytest.ini` — `asyncio_mode = auto`.

## Three real bugs found and fixed during this task

### 1. `prune_system(metadata=True)` drops our own Postgres schema too

Discovered mid-task when the `artifacts` table vanished after a routine cognee state reset. `prune_system(metadata=True)` calls `get_relational_engine().delete_database()`, and since we deliberately share one Postgres database between cognee's tables and our own (BE-2's `connectors`/`artifacts`/`watermarks`/`jobs`/`dead_letters`), it drops **everything**, not just cognee's tables. Full details and the safe alternative (`prune_data()`, or `prune_system(metadata=False)`) are in **memory/OPS-1.md**'s warning box — read it before calling any prune function anywhere in this codebase.

### 2. Alembic version-table collision with cognee's own internal migrations

cognee 1.6.0 has its own Alembic-based relational migration system (`cognee.modules.migrations`) that, by default, also uses a table literally named `alembic_version` — the same default name our own `backend/migrations/` setup used. After recovering from bug #1 by re-running our own `alembic upgrade head`, cognee's next `cognee.add()` call failed with `CommandError: Can't locate revision identified by 'c753346f2811'` — cognee's migration startup check read `alembic_version`, found *our* revision id in what it expected to be *its own* tracking table, and had no idea what to do with it.

**Fixed** in `backend/migrations/env.py`: both `context.configure()` calls now pass `version_table="app_alembic_version"`, giving our migrations a distinct tracking table. Recovery required dropping the polluted `alembic_version` table (safe — it's cognee's table name, not ours) and re-stamping our schema under the new table name (`alembic stamp head`, not `upgrade head`, since the actual tables already existed).

**If you ever see `alembic upgrade`/`stamp` fail with a "no such revision" error involving a revision ID that looks like ours but the error is about *cognee's* migrations (or vice versa), suspect this exact collision recurring** — check `\dt` in psql for both `alembic_version` and `app_alembic_version` existing simultaneously as the sign something's confused.

### 3. `cognee.add()` refuses content changes at the same path — use `cognee.update()` instead

The architecture doc's literal instruction is "Hash changed → `cognee.delete(cognee_doc_id)` then re-add." In cognee 1.6.0, `add()` **actively refuses** to re-add a file at a path it already has different content for — raises `DocumentUpdateRequiredError`, and critically, a prior `cognee.datasets.delete_data()` call (soft mode — "hard" mode is explicitly discouraged by cognee itself in its own signature comment) does **not** clear the tracking row that triggers this refusal, so delete-then-add still gets rejected.

cognee's own error message and its `refuse_changed_existing_documents.py` module docstring are explicit about the intended path: *"A file that matches a stored document by origin but not by content is an update, and updates go through `update()` so the document keeps its id and its graph is replaced in place instead of a second copy being minted."* That is **exactly** the outcome the architecture doc's delete-before-re-add wants (no stale version left to self-contradict) — just via the API cognee 1.6.0 actually provides for it, since the doc was written against an older version. `ingest_artifacts` therefore calls `cognee.update(data_id=<uuid>, data=<path>, dataset_id=<uuid>, node_set=<tags>)` for the `updated` case, not delete+add.

**Verified this genuinely replaces content, not just labels it updated**: manually changed one seed artifact's body, ran ingestion, confirmed via Neo4j that the OLD entity text was gone and only the NEW text's entities remained (no coexisting stale + fresh versions) — see the independent verification's step 6 for the repeatable version of this check.

## Also: `cognee.add()`'s and `cognee.update()`'s real API shapes (not documented anywhere obvious)

- `cognee.add(data, dataset_name, node_set=...)` returns a `PipelineRunCompleted` object; the cognee doc id is at `result.data_ingestion_info[0]["data_id"]` (a UUID). Store this as `cognee_doc_id` — nothing else in the return value is useful for our purposes.
- `cognee.update(data_id, data, dataset_id, node_set=...)` needs a **dataset UUID**, not a name — resolved via `cognee.datasets.list_datasets()` filtering by `.name`, since cognee has no "get dataset by name" helper. `_get_dataset_id()` in `ingestion.py` does this once per batch (not per artifact).
- `cognee.datasets.delete_all()` — clears all of cognee's own datasets (graph + vector + relational Data rows), safe to call (unlike `prune_system(metadata=True)`). Used for test isolation in `test_ingestion.py`.

## Why the test suite is one big test function, not four

`pytest-asyncio` gives each `async def test_*` its own event loop by default. cognee caches its relational async engine/connection pool at module level (`@lru_cache`-wrapped internals). An asyncpg connection created in test A's event loop breaks with `RuntimeError: ... attached to a different loop` when cognee's cached engine tries to reuse it from test B's (different) event loop. Session-scoped event loop config in `pytest.ini` didn't reliably fix this across pytest-asyncio's separate fixture-loop-scope vs. test-loop-scope settings. The robust fix: **one test function's body = one event loop**, so don't split cognee-touching scenarios across multiple `async def test_*` functions in this codebase — sequence them inside one test instead, as `test_ingestion_lifecycle` does.

## For downstream tasks

- **BE-9** (manual Neo4j inspection gate): run `scripts/ingest_seed_corpus.py` from a clean state, then inspect via `cypher-shell` (no browser extension available in this environment — see memory/00-project-context.md) or Neo4j Browser at http://localhost:7474 if the person doing BE-9 has real browser access.
- **BE-10** (verify `include_references`): the seed corpus is already ingested and cognified after running the script above — ready for a real `cognee.search(..., include_references=True)` call.
- **BE-25** (Phase 4 ingestion pipeline v2) will build a more general version of this staging/crash-safety pattern for multiple concurrent connectors — this task's single-connector version is the model to generalize from, not to throw away.
- The `content_hash_for()` function hashes `title + body` only — metadata-only changes (topic reassignment, etc.) don't trigger a re-add. If a future task needs metadata changes to also trigger update, extend this function, don't add a second hash.
