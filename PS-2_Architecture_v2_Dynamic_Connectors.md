# PS-2: Company Brain — Architecture v2
## Dynamic Connectors, Scalability, Reliability

v1 treated connectors as code objects instantiated at boot. That's incompatible with "user adds a connector at runtime." This version makes connectors **runtime state** — rows in a registry with a lifecycle, credentials, health, and isolated failure domains.

It also addresses the two judging criteria v1 didn't argue for: **Scalability** and **Reliability**.

---

## 1. What Changed

| v1 | v2 |
|---|---|
| Connectors hardcoded, instantiated at startup | Connector **registry** in Postgres; instantiated on demand from a catalog |
| Credentials in env vars | Encrypted credential store, supplied at runtime via UI |
| One `/sync` for all sources | Per-connector jobs with independent lifecycle and failure isolation |
| Failure = skipped + logged | Circuit breaker, retry with backoff, dead-letter queue |
| Fetch → cognify inline | Parallel fetch → **serialized cognify** behind a global lock |
| No disconnect path | Disconnect (stop syncing) vs Remove (purge nodes) |
| In-process background task | `JobQueue` interface — in-process now, distributed later, same contract |

The last row is the architectural move that wins Scalability points without spending hours: **design the seams so scaling is a swap, not a rewrite**, then say exactly that in the pitch.

---

## 2. Connector Model

### 2.1 Catalog vs Registry

Two distinct concepts. Conflating them is the mistake.

- **Catalog** — static, in code. What connector *types* exist: Confluence, Jira, SharePoint, Slack, plus a local fixture server. Declares transport, required credential fields, and a capability manifest.
- **Registry** — dynamic, in Postgres. What the user has actually *connected*, with state, credentials, watermark, and health.

```python
@dataclass(frozen=True)
class ConnectorSpec:            # CATALOG — static
    key: str                    # "jira"
    display_name: str
    transport: Literal["streamable_http", "stdio"]
    default_url: str | None
    credential_fields: list[CredField]   # [{name, label, secret: bool}]
    manifest: CapabilityManifest         # see 2.3
```

```sql
-- REGISTRY — dynamic
CREATE TABLE connectors (
  id             UUID PRIMARY KEY,
  spec_key       TEXT NOT NULL,              -- FK into the code catalog
  state          TEXT NOT NULL,              -- see state machine
  config         JSONB NOT NULL,             -- non-secret: url, project key, space
  credentials    BYTEA,                      -- Fernet-encrypted JSON
  watermark      TIMESTAMPTZ,
  last_error     TEXT,
  failure_count  INT NOT NULL DEFAULT 0,
  breaker_open_until TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.2 Lifecycle state machine

```
                 ┌──────────────┐
                 │  AVAILABLE   │  in catalog, not connected
                 └──────┬───────┘
                        │ user submits credentials
                 ┌──────▼───────┐
                 │  VALIDATING  │  handshake + tools/list + capability check
                 └──┬────────┬──┘
              fail  │        │  ok
          ┌─────────▼──┐  ┌──▼──────────┐
          │   FAILED   │  │  CONNECTED  │  ready, never synced
          └─────▲──────┘  └──┬──────────┘
                │            │ enqueue sync
                │        ┌───▼──────┐
                │        │ SYNCING  │ ──partial──┐
                │        └───┬──────┘            │
                │            │ ok          ┌─────▼──────┐
                │        ┌───▼──────┐      │  DEGRADED  │ some items dead-lettered
                │        │  SYNCED  │      └─────┬──────┘
                │        └───┬──────┘            │
                │            │                   │
                └────────────┴───────────────────┘
                     breaker opens after N failures
                                │
                         ┌──────▼──────┐
                         │  DISABLED   │  user paused; data retained
                         └─────────────┘
```

`VALIDATING` is the step teams skip. Validate at connect time — handshake, `list_tools()`, confirm the manifest's required tools exist — so the user learns their token is wrong immediately, not three minutes into a sync.

### 2.3 Capability manifest

Each catalog entry declares which MCP tool to call and how to map its output to the canonical `Artifact`. This is what makes "add a connector" a config change rather than a code change.

```python
JIRA_MANIFEST = CapabilityManifest(
    required_tools=["searchJiraIssuesUsingJql"],
    list_call=ToolCall(
        tool="searchJiraIssuesUsingJql",
        args={"jql": "updated >= '{since}' ORDER BY updated DESC",
              "maxResults": "{page_size}"},
    ),
    field_map={
        "id":         "$.key",
        "title":      "$.fields.summary",
        "body":       "$.fields.description",
        "author":     "$.fields.reporter.displayName",
        "created_at": "$.fields.created",
        "updated_at": "$.fields.updated",
        "url":        "$.self",
    },
    artifact_type="ticket",
)
```

One generic `MCPConnector` class interprets any manifest. Adding a fifth connector = adding a manifest.

**Graceful unknown-server path:** if a user points at an unrecognised MCP server, call `list_tools()`, pick tools whose names match list/search/fetch patterns, and have an LLM propose a field map from a sample response. Ship it disabled behind a "Generic MCP (experimental)" card. Say in the pitch that this is the extensibility path and that you didn't productionise it — scoping discipline reads better than a half-working feature.

### 2.4 Credentials

- Encrypt with Fernet, key from `CREDENTIAL_ENCRYPTION_KEY` env var.
- **Never** return credentials from any endpoint. `GET /connectors` returns field *names* and a `configured: true` flag only.
- Redact secrets in logs at the logging-filter level, not at each call site.
- Decrypt only inside the connector runner, hold in memory for the job, discard.

OAuth is out of scope for four hours. Paste-a-token is the honest choice; note OAuth as the production path in the pitch, and say why you deferred it.

---

## 3. Ingestion Pipeline

### 3.1 Parallel fetch, serialized cognify

The single most important concurrency fact: **fetching is independent per connector, but cognify writes to one shared Cognee dataset.** Running two cognify passes concurrently on the same dataset is undefined behaviour.

```
Jira fetch     ─┐
Confluence     ─┼─→ [parallel, semaphore=4] ─→ normalize ─→ stage to Postgres
Slack fetch    ─┤                                                    │
SharePoint     ─┘                                                    ▼
                                            ┌────────────────────────────────┐
                                            │ cognify worker (GLOBAL LOCK=1) │
                                            │ drains staged artifacts,       │
                                            │ batches, one cognify per batch │
                                            └────────────────────────────────┘
```

Staging to Postgres first means a cognify crash doesn't lose fetched data — the batch is replayed from the staging table.

```python
FETCH_CONCURRENCY = asyncio.Semaphore(4)
COGNIFY_LOCK_KEY  = 0xC0FFEE          # pg_try_advisory_lock
COGNIFY_BATCH     = 25
```

### 3.2 Idempotency

```sql
CREATE TABLE artifacts (
  id             TEXT PRIMARY KEY,        -- "jira:PLAT-412"
  connector_id   UUID REFERENCES connectors(id) ON DELETE CASCADE,
  content_hash   TEXT NOT NULL,
  cognee_doc_id  TEXT,                    -- for delete-before-re-add and purge
  source TEXT, type TEXT, topic TEXT,
  title TEXT, author TEXT, url TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ
);
```

On ingest: hash unchanged → skip entirely. Hash changed → `cognee.delete(cognee_doc_id)` then re-add. This is what prevents v1's bug where a revised document contradicts its own earlier version.

`cognee_doc_id` is also what makes **Remove connector** work — purge exactly that connector's nodes, leave everything else standing.

### 3.3 Dead letters

```sql
CREATE TABLE dead_letters (
  id UUID PRIMARY KEY, connector_id UUID, artifact_id TEXT,
  stage TEXT,            -- fetch | normalize | cognify
  error TEXT, payload JSONB, created_at TIMESTAMPTZ
);
```

One artifact failing extraction must not fail the batch. Dead-letter it, continue, mark the connector `DEGRADED`, and surface the count in the UI. **A visible "23 synced, 2 failed" is a reliability signal. A silent 23 is a bug you haven't found yet.** Say that line in the pitch.

### 3.4 Job queue seam

```python
class JobQueue(Protocol):
    async def enqueue(self, job: SyncJob) -> str: ...
    async def get(self, job_id: str) -> SyncJob: ...
```

`InProcessQueue` today: `asyncio.Queue` + one worker task + state persisted to a `sync_jobs` table so a restart doesn't lose visibility. `RedisQueue` / Render Background Worker later: same interface, no caller changes.

Persisting job state to Postgres rather than a dict is 20 minutes of work and it's the difference between "we'd have to rewrite this" and "we'd point it at Redis."

---

## 4. Reliability Engineering

### 4.1 Circuit breaker, per connector

```python
CLOSED  → 3 consecutive failures → OPEN (60s)
OPEN    → reject immediately, no network call
OPEN    → after cooldown → HALF_OPEN (one probe)
HALF_OPEN → success → CLOSED | failure → OPEN (backoff ×2, cap 10 min)
```

State lives in `connectors.failure_count` / `breaker_open_until`, so it survives restarts. Without a breaker, a dead Confluence server means every sync burns 20 seconds on timeouts.

### 4.2 Retry policy

Exponential backoff with jitter, 3 attempts, **only on retryable errors**. Retrying a 401 is pointless and looks careless; retrying a 429 or 503 is correct.

```python
RETRYABLE = {429, 500, 502, 503, 504, "timeout", "connection_reset"}
delay = min(2 ** attempt, 8) + random.uniform(0, 0.5)   # jitter avoids sync stampede
```

### 4.3 Timeouts at every boundary

Nothing calls the network without a deadline.

| Boundary | Timeout |
|---|---|
| MCP handshake | 10s |
| MCP tool call | 20s |
| Whole connector fetch | 60s |
| Cognify batch | 300s |
| LLM completion | 30s |
| `/ask` end-to-end | 25s (then serve degraded) |

### 4.4 Health vs readiness

Distinct endpoints, distinct meanings.

- `GET /health` — process alive. Never touches a dependency. Used by the keep-warm pinger.
- `GET /ready` — Neo4j reachable, Postgres reachable, Cognee configured. Used by you before the demo, and it's what you open if something looks wrong on stage.

### 4.5 Degradation matrix

| Failing | Still works | User sees |
|---|---|---|
| All MCP servers | Everything (seed corpus) | Grey connector cards |
| One connector | All others + seed | One red card, isolated |
| Cognify worker | Query path fully intact | "Sync queued" |
| Neo4j | Nothing graph-based | `/ready` red, clear error |
| OpenAI rate limit | Cached answers | Banner: "serving cached response" |
| Tavily | Everything internal | Toggle disabled with reason |

Put this table in the deck. It's the direct answer to "what happens when X breaks," which is the Reliability question judges actually ask.

### 4.6 Observability

Request ID generated at middleware, propagated through every log line and returned in `X-Request-ID`. Structured JSON logs. A `/metrics` endpoint with counters — artifacts ingested, dead letters, breaker trips, p50/p95 `/ask` latency — is 30 minutes and gives you real numbers to quote instead of adjectives.

---

## 5. Scalability

### 5.1 What breaks first, in order

Naming the bottleneck precisely is worth more than claiming you scale.

| Scale | First constraint | Mitigation |
|---|---|---|
| ~50 artifacts (demo) | None | — |
| ~1k | Cognify wall time — LLM extraction is serial per batch | Batch + parallel extraction, raise cognify concurrency across *distinct* datasets |
| ~10k | Single shared dataset; every sync re-ranks a bigger graph | Partition into per-source datasets, query with `datasets=[...]` scoping |
| ~100k | Neo4j Aura Free node cap; pgvector recall without tuned index | Aura paid tier, HNSW index tuning, dataset-per-tenant |
| Many users | Single-process job queue | Swap `JobQueue` to Redis, run Render Background Workers |

### 5.2 The quadratic one

Contradiction detection is pairwise: `C(n,2)` LLM calls over candidate artifacts. At `top_k=20` that's 190 pairs. Unbounded, this is the component that fails first under load and it's easy to miss.

**Bounded design:**
1. Filter candidates to a single topic first — reduces n by roughly an order of magnitude.
2. Sort pairs by date distance descending; supersession correlates with time gaps.
3. Hard cap at 5 pairs, evaluated concurrently via `asyncio.gather`.
4. Cache conflict verdicts keyed on `(artifact_id_a, artifact_id_b, hash_a, hash_b)` — the same pair is re-examined constantly across questions, and the answer only changes when content changes.

That cache turns the steady-state cost of contradiction detection to near zero. It's also a good thing to be asked about.

### 5.3 Multi-tenancy seam

Cognee's `search()` accepts `user` and `datasets`. Today: one implicit tenant. The seam is already there — carry a `tenant_id` on the connector registry and pass it through to `dataset_name`. Worth one sentence in the pitch, not worth building.

### 5.4 Read path scaling

Query latency is roughly constant in corpus size because `top_k` is bounded — the honest scaling story is that **ingestion scales with data, querying scales with traffic**, and they scale independently because they're already separate concerns behind the queue. Separating them is the reason that's true, so say it as a design consequence rather than a happy accident.

---

## 6. API Surface (v2)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/connectors/catalog` | Available types + required credential fields |
| `GET` | `/connectors` | Connected instances: state, last sync, counts, breaker status |
| `POST` | `/connectors` | Create + validate (handshake, `list_tools`, manifest check) |
| `POST` | `/connectors/{id}/sync` | Enqueue sync → `202 {job_id}` |
| `POST` | `/connectors/{id}/disable` | Stop syncing, retain data |
| `DELETE` | `/connectors/{id}` | Purge this connector's nodes + rows |
| `GET` | `/jobs/{job_id}` | Progress: fetched / ingested / failed / state |
| `GET` | `/jobs/{job_id}/stream` | SSE live progress (optional, good demo theatre) |
| `POST` | `/ask` | Answer + `trace_id` (fast path) |
| `GET` | `/ask/{trace_id}/details` | Path + contradiction (slow path) |
| `GET` | `/health` `/ready` `/metrics` | Ops |

All mutating connector endpoints behind a shared-secret header.

---

## 7. Frontend

**Connectors page** — catalog grid. Each card: icon, name, state pill, last sync, artifact count, dead-letter count. Not-connected shows **Connect** → modal with the spec's credential fields → validate inline → **Sync now**.

**Live sync panel** — poll `/jobs/{id}` at 1s, or SSE. Show fetched → ingested → cognified as three advancing counters. This is the visual that sells the whole system; make it the centre of the demo.

**Ask page** — unchanged from v1, plus a source-coverage line: *"Answering from 47 artifacts across Seed + Jira."* Cheap, and it makes the connector work visible in the answer itself.

---

## 8. Revised Build Order

The dynamic connector work is real scope. Something has to give — and it's the number of live connectors, not the connector *system*.

| Time | Track A — data/graph | Track B — API/UI |
|---|---|---|
| 0:00–0:30 | Aura + Postgres + Cognee wired, `prune` run | Skeletons, CORS, `/health`, **deploy both now** |
| 0:30–1:00 | **Seed corpus** (chain + contradiction, deliberate) | Schema: connectors, artifacts, jobs, dead_letters |
| 1:00–1:30 | **Inspect real graph in Neo4j Browser** — labels, `id` prop, rel types, hub degrees | Catalog + registry + `POST /connectors` with validation |
| 1:30–2:15 | Cypher path with hub exclusion + ranking | Generic `MCPConnector` + manifest interpreter + **one** real connector |
| 2:15–2:45 | Contradiction: separate wide retrieval, capped pairs, cache | Job queue, staging, cognify worker under global lock |
| 2:45–3:15 | Circuit breaker, retries, dead letters | Connectors UI + live sync panel |
| 3:15–3:45 | `/metrics`, degradation testing — **kill a connector on purpose and watch it isolate** | Ask page polish, two-phase `/ask` |
| 3:45–4:00 | Deploy, rehearse, script | |

**Build one real MCP connector properly, not four badly.** Jira is the best choice — it carries your incident artifact, so it strengthens the multi-hop chain rather than just adding volume. The other three ship as catalog entries that validate and fail cleanly, which demonstrates the same architecture.

Ship a **local fixture MCP server** as a fifth catalog entry. It's a genuine MCP server over `stdio` serving your seed corpus — not a mock — so the connector path is provably exercised even if every external service is down. That's an honest reliability answer, and it's defensible under questioning in a way a mock isn't.

### Cut list, in order
1. SSE job streaming → polling
2. Generic/unknown MCP adapter
3. Connectors 2–4 → catalog entries only
4. `/metrics`
5. Tavily

**Never cut:** contradiction flag, Cypher multi-hop trace, per-connector failure isolation. Those map 1:1 to the three criteria you'd otherwise lose.

---

## 9. Judging Criteria Map

**Mentoring round**

| Criterion | Evidence |
|---|---|
| Problem Clarity (5) | Fragmentation → conflicting sources → agent hallucination. Lead with the contradiction demo, not the architecture. |
| Design Decisions (5) | The decisions table with *rationale*. Especially: why query-time contradiction over ingest-time edges; why Postgres over ephemeral disk; why Cypher over LLM prose. |
| Scalability (5) | §5 — name what breaks first and at what scale. Specific beats grand. |
| Technical Implementation (5) | Working multi-hop path pulled from a live graph. |
| Scope & Prioritisation (5) | The cut list, and the explicit non-goals. Stating what you deliberately didn't build is the highest-scoring move here. |

**Judging round**

| Criterion | Evidence |
|---|---|
| Production standards (5) | Encrypted credentials, redacted logs, timeouts everywhere, health vs readiness, idempotent ingest, request IDs |
| Technical Understanding (5) | Know that GRAPH_COMPLETION is a 1-hop retriever and that your Cypher panel is what satisfies multi-hop. Know why `shortestPath` alone finds hub nodes. |
| System Architecture (5) | Parallel fetch / serialized cognify; the `JobQueue` seam; catalog vs registry |
| Completeness (5) | End-to-end: connect → ingest → ask → answer + path + conflict |
| Reliability (5) | **Break a connector live on stage.** Show it isolate, show the breaker open, show the rest still answering. |

### The 1-minute pitch

> Company knowledge is fragmented, and worse, it contradicts itself. We built a shared knowledge layer over Cognee and Neo4j that doesn't just find documents — it finds the relationships between them, and flags when two sources disagree, with dates, so you know which one is current. Connectors are added at runtime: click Jira, paste a token, and the graph grows while you watch. Every connector is an isolated failure domain — if one dies, the rest keep answering.

### Two questions you will be asked

**"How is this different from RAG?"** — Don't answer conceptually. Show the Cypher path panel and say: that came from a graph traversal, not from a language model describing one. Vector RAG cannot produce it.

**"What happens when a connector fails?"** — Kill one. Don't describe it.

---

## 10. Honest Non-Goals

State these unprompted. Naming them reads as judgement; being caught without them reads as oversight.

- OAuth — paste-a-token only; OAuth is the production path
- Real-time push ingestion — pull with watermarks, no webhooks
- General contradiction detection — topic grouping + pairwise LLM judge, bounded and cached
- Multi-tenancy — seam exists, single tenant implemented
- Access control inheritance — **the real one.** A production company brain must respect source-system permissions, or it becomes a data-leak engine. We index everything the token can see. Naming this shows you understand what shipping it would actually require.
