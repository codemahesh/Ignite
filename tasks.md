# PS-2 Company Brain — Implementation Tasks

Source: `PS-2_Company_Brain_Architecture (1).md` (v1) + `PS-2_Architecture_v2_Dynamic_Connectors.md` (v2, supersedes v1 on connectors) + `PS-2_Architecture_Review.md` (fixes folded into the tasks below).

**Status legend:** `[ ]` pending · `[x]` done · `[~]` in progress (edit in place as work lands)

**Track:** `BE` backend · `FE` frontend · `OPS` deploy/infra (no code split, but its own critical path)

Each task lists `Depends:` by ID. Tasks with no shared dependency can run in parallel across tracks.

---

## Phase 0 — Foundation (deploy first, stakes low)

- [x] **OPS-1** [OPS] Provision Render Postgres, Neo4j Aura Free, set all env vars from architecture §6 (`LLM_API_KEY`, `GRAPH_DATABASE_*`, `DB_*`, `TAVILY_API_KEY`, `CREDENTIAL_ENCRYPTION_KEY`). Confirm exact Cognee env var names against installed version's docs.
  Depends: — · Accept: `cognee` connects to Postgres+pgvector and Neo4j from a local script; `prune.prune_data()` + `prune_system(metadata=True)` run once cleanly.
  **Done (local-first deviation, see memory/OPS-1.md):** local Docker Postgres+pgvector (port 5436) + Homebrew-installed Neo4j (Docker Hub CDN had a TLS trust failure on this machine). Verified by independent subagent — `backend/scripts/verify_infra.py` passes end-to-end.

- [x] **BE-1** [BE] FastAPI skeleton with `--workers 1` pinned in the start command, `CORSMiddleware` wired to `FRONTEND_ORIGIN`, `GET /health` (process-alive only, no dependency calls).
  Depends: — · Accept: deployed service responds 200 on `/health`; browser call from deployed frontend origin isn't blocked by CORS.
  **Done (local, see memory/BE-1.md):** `backend/app/main.py` + `start.sh`. Verified by independent subagent — /health 200, CORS allows FRONTEND_ORIGIN and rejects others, --workers 1 confirmed on the live process.

- [x] **FE-1** [FE] Next.js skeleton, `NEXT_PUBLIC_API_BASE_URL` env var wired, deployed to Render.
  Depends: — · Accept: deployed page loads and successfully calls `BE-1`'s `/health`.
  **Done (local, see memory/FE-1.md):** Next.js 16.3.5 at `frontend/`, port 3010. Verified by independent subagent — build clean, page loads, cross-origin call to backend /health succeeds.

- [~] **OPS-2** [OPS] External uptime pinger hitting `/health` every 10 minutes from first deploy onward.
  Depends: BE-1 · Accept: pinger configured and firing; service does not cold-start on first judge request.
  **Blocked on deployment (see memory/OPS-2.md):** `.github/workflows/keep-alive.yml` built and verified (cron every 10min, correct curl/no-op logic, actionlint-clean). Cannot fire for real or prove the cold-start guarantee until deployed — set the `HEALTH_CHECK_URL` repo variable after first Render deploy, no code changes needed.

---

## Phase 1 — Data Layer & Schema

- [x] **BE-2** [BE] Postgres schema: `artifacts` (id, connector_id, content_hash, cognee_doc_id, source, type, topic, title, author, url, created_at, updated_at, ingested_at), `watermarks` (source, last_synced_at), `jobs`/`sync_jobs`, `dead_letters`, `connectors` (registry table per v2 §2.1).
  Depends: OPS-1 · Accept: all tables created via migration; each has a primary key and the FKs in the architecture docs.
  **Done (see memory/BE-2.md):** SQLAlchemy models + Alembic migration `c753346f2811`. Verified by independent subagent — all 5 tables exist with PKs; FKs match doc literal SQL exactly (including dead_letters' deliberate lack of FK); FK enforcement proven live with a real rejected insert.

- [ ] **BE-3** [BE] `GET /ready` — checks Neo4j + Postgres + Cognee config reachable (distinct from `/health`).
  Depends: BE-2 · Accept: returns 200 only when all three dependencies respond; used manually before demo, not by the pinger.

---

## Phase 2 — Canonical Ingestion (Seed Data First)

- [ ] **BE-4** [BE] `Artifact` dataclass (canonical envelope) + `SourceConnector` protocol (`fetch(since) -> Iterable[Artifact]`).
  Depends: — · Accept: importable module, typed, matches architecture §3 field list exactly.

- [ ] **BE-5** [BE] Artifact-ID resolution: write artifacts to disk as `<artifact_id>.md` with `<!-- artifact_id: ... | source: ... | date: ... -->` header comment, tag `node_set=["artifact:{id}", "source:{...}", "topic:{...}"]`. One resolver function with all three fallback routes, logs which one fired.
  Depends: BE-4 · Accept: given a Cognee search result, resolver returns the correct `artifact.id` via at least one route in a test case.

- [ ] **BE-6** [BE] Write deliberate seed corpus: artifacts forming a real multi-hop chain (Policy → Decision → Incident) and a real date-based contradiction (two same-topic docs, different `updated_at`). Dense and unambiguous, not "realistic filler."
  Depends: BE-4 · Accept: corpus reviewed by hand — the intended chain and conflict are unambiguous from reading the text alone.

- [ ] **BE-7** [BE] `SeedFileConnector` implementing the connector protocol over BE-6's corpus.
  Depends: BE-4, BE-6 · Accept: `fetch(since=None)` yields all seed artifacts as valid `Artifact` objects.

- [ ] **BE-8** [BE] Ingestion runner: `cognee.add()` per artifact via BE-5's ID-carrying path, staged through Postgres `artifacts` table first (crash-safe replay), then `cognee.cognify(datasets="company_brain")`. Enforce delete-before-re-add on content-hash change (skip if `a.id == b.id` in conflict module as the safety net).
  Depends: BE-2, BE-5, BE-7 · Accept: running the seed corpus through this produces a queryable Cognee dataset; re-running with one artifact edited replaces it instead of duplicating.

- [ ] **BE-9** [BE, gate] **Manual: inspect the ingested graph in Neo4j Browser.** Record node labels, the `id`/name property, relationship types, and hub-node degrees. This is a blocking gate for BE-13/BE-14 — do not write Cypher before this.
  Depends: BE-8 · Accept: written notes on schema shape exist; the multi-hop chain from BE-6 visibly resolved into linked nodes.

- [ ] **BE-10** [BE] Verify `cognee.search(..., include_references=True)` returns node/chunk identifiers that resolve via BE-5. If not, implement fallback parallel `SearchType.CHUNKS` call for provenance.
  Depends: BE-8 · Accept: a test query against the seed corpus returns references that resolve to correct artifact IDs.

---

## Phase 3 — Query Layer

- [ ] **BE-11** [BE] `POST /ask` — wires `cognee.search(GRAPH_COMPLETION, include_references=True)` for the answer step.
  Depends: BE-10 · Accept: given a seed question, returns an answer string plus resolvable references.

- [ ] **BE-12** [BE] Postgres metadata lookup: resolve reference → artifact ID → row in `artifacts` table (dates, source, etc). Never trust Cognee for dates.
  Depends: BE-2, BE-11 · Accept: given a reference from BE-11, returns the correct `updated_at`/`source`/`topic`.

- [ ] **BE-13** [BE] Cypher multi-hop path query with hub-node exclusion (`size((n)--()) > 15` filter) and relationship-type whitelist, `coalesce(r.relationship_name, type(r))` for edge labels. Fallback to `allShortestPaths`/ranked candidates if plain `shortestPath` returns trivial hub-routed paths. Hide panel entirely if no path within 4 hops — never fabricate.
  Depends: BE-9, BE-12 · Accept: run against the seed chain from BE-6, returns the *semantically meaningful* path, not a 2-hop hub detour.

- [ ] **BE-14** [BE] Contradiction module: **separate wide `SearchType.CHUNKS` retrieval** (top_k=20, not the answer's references), group by topic, pairwise LLM conflict judge capped at 5 pairs sorted by date-distance descending, evaluated concurrently. No date filter gating detection — dates only order results; tie in dates → say so explicitly. Skip pairs where `a.id == b.id`. Cache verdicts keyed on `(id_a, id_b, hash_a, hash_b)`.
  Depends: BE-9, BE-12 · Accept: given BE-6's planted contradiction, module detects it and correctly identifies newer vs older; re-querying is served from cache.

- [ ] **BE-15** [BE] Conflict-aware answer regeneration: when BE-14 detects a conflict, re-run `GRAPH_COMPLETION` with a system prompt instructing it to acknowledge both positions and prefer the more recent one.
  Depends: BE-14 · Accept: for the planted-contradiction question, the answer text and the contradiction banner agree with each other.

- [ ] **BE-16** [BE] UTC-aware datetime normalization helper applied at the connector/normalizer boundary; applied everywhere dates are compared (contradiction sort, watermarks).
  Depends: BE-4 · Accept: mixed naive/aware datetimes from different sources never raise `TypeError` in the contradiction module.

- [ ] **BE-17** [BE] `POST /ask` two-phase response: returns `{answer, trace_id}` as soon as BE-11/BE-15 resolve; `GET /ask/{trace_id}/details` returns `{path, contradiction, sources, source_status}` once BE-13/BE-14 finish.
  Depends: BE-13, BE-15 · Accept: `/ask` responds in ~2-3s; `/ask/{trace_id}/details` fills in shortly after with path + contradiction data.

- [ ] **BE-18** [BE] Tavily integration: fires only when `use_web_search=true`, runs concurrently with the answer step via `asyncio.gather`, returned as a separate `web_results` block, never merged into the grounded answer.
  Depends: BE-11 · Accept: toggle off → no Tavily call made; toggle on → results present and visually/structurally separate.

- [ ] **BE-19** [BE] Answer cache keyed on `(normalized_question, use_web_search)`, pre-warmed on startup (not just on deploy) for the rehearsed demo questions.
  Depends: BE-17 · Accept: rehearsed questions return instantly after a fresh restart, before any manual warm-up call.

---

## Phase 4 — Dynamic Connectors (v2)

- [ ] **BE-20** [BE] `ConnectorSpec` catalog (code, static) for Confluence, Jira, SharePoint, Slack + capability manifest structure (`required_tools`, `list_call`, `field_map`, `artifact_type`).
  Depends: BE-4 · Accept: `GET /connectors/catalog` (once wired) can enumerate all 4 specs with their credential fields.

- [ ] **BE-21** [BE] Generic `MCPConnector` class that interprets any `ConnectorSpec` manifest into `fetch()` calls and `Artifact` objects via `field_map`.
  Depends: BE-20 · Accept: given the Jira manifest and a live/mock MCP response, produces valid `Artifact` objects.

- [ ] **BE-22** [BE] Connector registry endpoints: `POST /connectors` (create + validate: handshake, `list_tools()`, manifest check → `VALIDATING` → `CONNECTED`/`FAILED`), `GET /connectors`, `POST /connectors/{id}/disable`, `DELETE /connectors/{id}` (purge via `cognee_doc_id`). Credentials Fernet-encrypted via `CREDENTIAL_ENCRYPTION_KEY`, never returned by any endpoint, redacted in logs at the logging-filter level.
  Depends: BE-2, BE-21 · Accept: creating a connector with a bad token lands in `FAILED` with a clear error; a valid one reaches `CONNECTED`; `GET /connectors` never leaks secret values.

- [ ] **BE-23** [BE] One real MCP connector wired end-to-end (Jira, per architecture recommendation — strengthens the seed chain). Hard caps enforced in the runner (`MAX_ITEMS_PER_SOURCE=25`, `MAX_AGE=180d`) and `asyncio.wait_for(fetch(), timeout=20)` regardless of what the connector does internally.
  Depends: BE-22 · Accept: connecting real Jira credentials and syncing pulls ≤25 recent issues without exceeding the timeout budget.

- [ ] **BE-24** [BE] Local fixture MCP server (stdio) serving the seed corpus as a 5th catalog entry — proves the connector path works even when every external service is down.
  Depends: BE-20, BE-21 · Accept: connecting to the fixture server and syncing ingests the seed corpus through the real connector path (not the `SeedFileConnector` shortcut).

- [ ] **BE-25** [BE] Ingestion pipeline v2: parallel fetch across connectors (`asyncio.Semaphore(4)`) → normalize → stage to Postgres `artifacts` table → serialized cognify behind `pg_try_advisory_lock` (global lock, batch size 25). Same lock guards startup seed ingest against double-ingestion on restart-mid-deploy.
  Depends: BE-8, BE-22 · Accept: two connectors syncing concurrently never run overlapping cognify passes; a crash mid-cognify replays from staged rows, not from scratch.

- [ ] **BE-26** [BE] Per-connector sync jobs: `POST /connectors/{id}/sync` → `202 {job_id}`, `GET /jobs/{job_id}` (fetched/ingested/failed/state), persisted to a `jobs` table (not an in-memory dict) so a restart doesn't lose visibility.
  Depends: BE-25 · Accept: triggering sync, killing the process, restarting, and polling `/jobs/{id}` still reflects the last known state (or is marked `failed` per BE-30's staleness rule).

- [ ] **BE-27** [BE] Watermark advancement ordered correctly: fetch all → add all → cognify once → advance watermark only for sources whose fetch succeeded and only after cognify succeeds. Dedupe via `updated_at >= since` + content hash.
  Depends: BE-25 · Accept: a cognify failure after a successful fetch leaves the watermark unadvanced for that source; a subsequent sync retries those items.

- [ ] **BE-28** [BE] Dead-letter handling: one artifact failing extraction doesn't fail the batch — write to `dead_letters`, continue, mark connector `DEGRADED`, expose count via `GET /connectors`.
  Depends: BE-25, BE-2 · Accept: a deliberately malformed artifact in a batch dead-letters itself while the rest of the batch ingests successfully.

- [ ] **BE-29** [BE] Topic assignment: fixed taxonomy of 6–8 topics, one batched LLM classification call per ~25 artifacts at ingest, stored in Postgres and mirrored into `node_set`.
  Depends: BE-25 · Accept: every ingested artifact has a non-null `topic` drawn from the fixed taxonomy.

- [ ] **BE-30** [BE] Circuit breaker per connector (`CLOSED → OPEN(60s) → HALF_OPEN → CLOSED|OPEN×2 backoff, cap 10min`), state persisted in `connectors.failure_count`/`breaker_open_until`. Retry policy: exponential backoff + jitter, 3 attempts, only on `{429,500,502,503,504,timeout,connection_reset}` — never retry 401.
  Depends: BE-22 · Accept: 3 consecutive simulated failures opens the breaker; subsequent calls are rejected without a network call until cooldown.

- [ ] **BE-31** [BE] Timeouts at every network boundary per architecture §4.3 table (MCP handshake 10s, MCP tool call 20s, connector fetch 60s, cognify batch 300s, LLM completion 30s, `/ask` end-to-end 25s with degraded fallback).
  Depends: BE-23 · Accept: each boundary has an explicit timeout in code, verifiable by grep — no bare network call without one.

- [ ] **BE-32** [BE] Orphaned job sweep: on startup, mark any `jobs` row stuck at `running` older than 10 minutes as `failed`.
  Depends: BE-26 · Accept: a job artificially left `running` from a simulated crash is marked `failed` on next boot.

- [ ] **BE-33** [BE] `GET /metrics`: counters for artifacts ingested, dead letters, breaker trips, `/ask` p50/p95 latency.
  Depends: BE-17, BE-28, BE-30 · Accept: endpoint returns real, non-zero numbers after exercising the system once.

- [ ] **BE-34** [BE] Shared-secret header auth on all mutating connector endpoints and `/sync`.
  Depends: BE-22 · Accept: requests without the header are rejected 401/403.

- [ ] **BE-35** [BE] Postgres connection pool tuned (`pool_size=3, max_overflow=2`) to stay under Render free-tier connection cap.
  Depends: BE-2 · Accept: pool config present; no connection-exhaustion errors under a simulated concurrent load of the full sync + ask paths.

---

## Phase 5 — Frontend

- [ ] **FE-2** [FE] Ask page: question box, answer panel, sources+dates list, Tavily toggle.
  Depends: FE-1, BE-11 · Accept: submitting a seed question renders a real answer with sources from the live backend.

- [ ] **FE-3** [FE] Path trace panel + contradiction banner, wired to `GET /ask/{trace_id}/details` (fills in after the initial answer paints).
  Depends: FE-2, BE-17 · Accept: for the planted-contradiction question, banner text reads "X appears to supersede Y" with dates; for the chain question, path renders as `A —[REL]→ B —[REL]→ C`.
  Note: hide the path panel entirely when BE-13 returns no path — never render a fabricated chain.

- [ ] **FE-4** [FE] Per-source status pills (`GET /sources` or `GET /connectors`) — green = synced, grey = unavailable/disabled, red = degraded.
  Depends: FE-1, BE-22 · Accept: disabling a real connector flips its pill to grey/red within one poll cycle.

- [ ] **FE-5** [FE] Connectors page: catalog grid (icon, name, state pill, last sync, artifact count, dead-letter count), Connect modal with dynamic credential fields per `ConnectorSpec`, inline validation feedback, Sync Now button.
  Depends: FE-1, BE-20, BE-22 · Accept: connecting a real Jira account through the UI reaches `CONNECTED` and a manual sync moves it to `SYNCING`→`SYNCED`.

- [ ] **FE-6** [FE] Live sync panel: poll `GET /jobs/{id}` at 1s interval, show fetched → ingested → cognified as advancing counters.
  Depends: FE-5, BE-26 · Accept: triggering a sync visibly advances all three counters in real time without a page refresh.

- [ ] **FE-7** [FE] Source-coverage line on the Ask page ("Answering from 47 artifacts across Seed + Jira").
  Depends: FE-2, BE-12 · Accept: the count and source list match the actual artifacts backing the current answer.

- [ ] **FE-8** [FE] `/sync` UI trigger control (cut-list item — build only if time remains; endpoint must exist regardless).
  Depends: FE-5, BE-26 · Accept: manual trigger from the UI kicks off a job visible in FE-6.

---

## Phase 6 — Demo Readiness

- [ ] **OPS-3** [OPS] Degradation drill: kill one connector live (revoke its token or stop the fixture server) and confirm it isolates — breaker opens, connector card goes red, all other sources and the seed corpus keep answering.
  Depends: BE-30, FE-4, FE-5 · Accept: killing one connector never affects `/ask` correctness or latency for unrelated questions.

- [ ] **OPS-4** [OPS] Smoke-test the 3 rehearsed demo questions end to end (answer, path, contradiction where applicable) against the deployed environment.
  Depends: BE-19, FE-3 · Accept: all 3 questions return correct, complete responses from the live deployed URLs, not localhost.

- [ ] **OPS-5** [OPS] Write the 90-second demo script + confirm the two anticipated questions ("How is this different from RAG?", "What happens when a connector fails?") have a rehearsed live answer, not just a slide.
  Depends: OPS-3, OPS-4 · Accept: script timed at ≤90s; both questions have a demonstrable, not just described, answer.

---

## Cut List (drop in this order if time runs out)

1. FE-8 `/sync` UI control (keep the endpoint)
2. BE-24 generic/unknown MCP adapter, experimental card only
3. Connectors 2–4 (Confluence/SharePoint/Slack) → catalog entries only, no live wiring
4. BE-33 `/metrics`
5. BE-18/FE-2 Tavily toggle

**Never cut:** BE-14/BE-15 (contradiction flag), BE-13 (Cypher multi-hop trace), BE-30 (per-connector failure isolation). These map directly to the three hardest-to-fake judging criteria.

---

## Open Risks (revisit if blocked)

- Cognee extraction quality on the seed corpus is unknown until BE-9's gate — if the chain doesn't resolve, rewrite the corpus denser/more explicit rather than tuning Cognee.
- `include_references` (BE-10) is load-bearing for BE-13 and BE-14 both — validate before building either.
- Postgres+pgvector under Cognee is less-travelled than the SQLite default (OPS-1) — if it fights you, a Render persistent disk with default stores is the fastest escape hatch.
