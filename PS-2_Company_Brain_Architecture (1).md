# PS-2: Company Brain — System Architecture

## 1. Decisions Locked

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | MCP data timing | Pre-ingested before demo, `/sync` endpoint for refresh | Demo never depends on a live handshake |
| 2 | Answer generation | Cognee native `SearchType.GRAPH_COMPLETION` | No custom orchestration to debug |
| 3 | Contradiction detection | Query-time, on date metadata attached at ingest | Deterministic, testable, fails visibly |
| 4 | Cognee relational + vector stores | Managed Postgres + pgvector (**changed from ephemeral disk**) | Render wipes ephemeral disk on restart/deploy |
| 5 | Graph store | Neo4j Aura Free | One less service to operate |
| 6 | `/sync` semantics | Incremental, watermark-based | Avoids full re-cognify cost |
| 7 | `/sync` execution | Background job + status polling | Cognify exceeds HTTP timeouts |
| 8 | MCP connections | Real creds via MCP client SDK, **non-blocking** | Upside if it works, zero downside if not |
| 9 | Multi-hop path | Direct Cypher to Neo4j, anchored on Cognee's returned nodes | Provably from the graph, not LLM prose |
| 10 | Dataset layout | Single Cognee dataset, source as metadata / `node_set` | Uniform graph; missing connector = fewer nodes, not a new code path |
| 11 | Tavily | Explicit user toggle only | Judges always know what's internal vs external |
| 12 | LLM provider | OpenAI (Cognee default: `gpt-4o-mini` + `text-embedding-3-small`) | Single key covers LLM and embeddings |
| 13 | Demo safety | Pre-warmed cache for rehearsed questions, live path still open | Insurance without faking it |

---

## 2. System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js (Render Web Service)                                       │
│  Ask box │ Answer panel │ Sources+dates │ Path trace │ Tavily toggle│
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS / JSON
┌────────────────────────────▼────────────────────────────────────────┐
│  FastAPI (Render Web Service)                                       │
│                                                                     │
│  ┌──────────────── INGESTION LAYER ──────────────────────────┐      │
│  │  SourceConnector (interface)                              │      │
│  │    ├── SeedFileConnector      ← always works, always runs │      │
│  │    ├── ConfluenceMCPConnector ┐                           │      │
│  │    ├── JiraMCPConnector       ├─ best-effort, skippable   │      │
│  │    ├── SharePointMCPConnector │                           │      │
│  │    └── SlackMCPConnector      ┘                           │      │
│  │              ↓ all emit the same canonical envelope        │      │
│  │  Normalizer → cognee.add(dataset_name="company_brain",     │      │
│  │                          node_set=[source, type])          │      │
│  │  Watermarks (per source, in Postgres) → incremental only   │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│  ┌──────────────── QUERY LAYER ──────────────────────────────┐      │
│  │  1. Answer    → cognee.search(GRAPH_COMPLETION,           │      │
│  │                   include_references=True)                │      │
│  │  2. Path      → Cypher shortestPath over returned nodes   │      │
│  │  3. Conflict  → group refs by topic, compare dates, judge │      │
│  │  4. Web       → Tavily, only if toggle is on              │      │
│  │  (1,2 run concurrently; 3 depends on 1)                   │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Job registry (background cognify) │ Answer cache (rehearsed Qs)    │
└──────┬─────────────────────┬────────────────────────┬───────────────┘
       │                     │                        │
┌──────▼────────┐   ┌────────▼─────────┐   ┌──────────▼──────────┐
│ Neo4j Aura    │   │ Postgres+pgvector│   │ Tavily API          │
│ (graph store) │   │ (relational+vec, │   │ (external, opt-in)  │
│               │   │  watermarks,jobs)│   │                     │
└───────────────┘   └──────────────────┘   └─────────────────────┘
```

---

## 3. Ingestion Layer

### Canonical envelope

Every connector — MCP or seed loader — emits identical shape. Cognee never sees a source-specific format.

```python
@dataclass
class Artifact:
    id: str              # stable, source-prefixed: "jira:PLAT-412"
    source: str          # confluence | jira | sharepoint | slack | seed
    type: str            # policy | decision | ticket | message | meeting_note
    title: str
    body: str            # plain text
    author: str | None
    created_at: datetime
    updated_at: datetime # ← drives contradiction resolution
    url: str | None
    topic: str | None    # coarse tag, used for conflict grouping
```

### Connector contract

```python
class SourceConnector(Protocol):
    name: str
    def fetch(self, since: datetime | None) -> Iterable[Artifact]: ...
```

`since=None` means full pull. Otherwise pull only items with `updated_at > since`.

### Non-blocking MCP

```python
for connector in CONNECTORS:
    try:
        artifacts = connector.fetch(since=watermarks.get(connector.name))
    except Exception as e:
        log.warning("connector %s unavailable: %s", connector.name, e)
        results.append(SourceStatus(connector.name, "unavailable", str(e)))
        continue   # ← the whole MCP story degrades to a log line
```

Surface `SourceStatus[]` in the `/sync` response and in the UI as small per-source pills (green = synced, grey = unavailable). A judge seeing "Confluence: unavailable" next to a working demo reads it as resilience, not as failure — but only if you designed it that way on purpose and say so.

### Handing to Cognee

```python
await cognee.add(
    data=artifact.body,
    dataset_name="company_brain",
    node_set=[f"source:{a.source}", f"type:{a.type}", f"topic:{a.topic}"],
)
```

Keep the envelope metadata in a Postgres `artifacts` table keyed by `artifact.id`. Cognee is the semantic layer; Postgres is your authoritative metadata sidecar. **Do not rely on Cognee to give dates back to you** — look them up yourself by artifact ID. This is the single most important decoupling in the design and it's what makes contradiction detection deterministic.

### Incremental sync

```
watermarks(source TEXT PRIMARY KEY, last_synced_at TIMESTAMPTZ)
```

Per source: read watermark → fetch since → dedupe by `id` + content hash → `cognee.add` only new/changed → `cognee.cognify(datasets="company_brain")` → advance watermark **only on success**.

---

## 4. Query Layer

### Sequence for `POST /ask`

```
                    ┌─→ [1] cognee.search(GRAPH_COMPLETION, include_references=True)
                    │        └─→ answer text + referenced node/chunk IDs
   question ────────┤
                    └─→ [4] Tavily (only if use_web_search=true)

   [1] refs ────────┬─→ [2] resolve refs → artifact IDs → Postgres metadata
                    │        └─→ Cypher shortestPath between top 2 anchor nodes
                    └─→ [3] group by topic → date-differing pairs → LLM conflict judge

   assemble → { answer, sources[], relationship_path[], contradiction?, web_results?, source_status[] }
```

Steps 1 and 4 run concurrently via `asyncio.gather`. Steps 2 and 3 depend on 1's references.

### [1] Answer

```python
result = await cognee.search(
    query_text=question,
    query_type=SearchType.GRAPH_COMPLETION,
    datasets=["company_brain"],
    top_k=10,
    include_references=True,
)
```

`include_references=True` is what makes steps 2 and 3 possible. Verify early in the build that it returns usable node identifiers — if it doesn't, fall back to a parallel `SearchType.CHUNKS` call for provenance. **Test this at hour 1, not hour 3.**

### [2] Relationship path (Cypher)

```cypher
MATCH (a) WHERE a.id IN $anchor_ids
MATCH (b) WHERE b.id IN $anchor_ids AND a <> b
MATCH p = shortestPath((a)-[*..4]-(b))
RETURN [n IN nodes(p) | coalesce(n.name, n.text)] AS nodes,
       [r IN relationships(p) | type(r)]          AS rels
LIMIT 1
```

Render as `Policy A —[SUPERSEDED_BY]→ Decision B —[CAUSED]→ Incident C`.

If no path within 4 hops: hide the panel. Never fabricate a chain.

**Fallback if Cypher is fighting you:** `SearchType.INSIGHTS` returns `(source, relationship, target)` triplets directly. Less precise — it's the neighbourhood, not the path between your two anchors — but it renders the same and takes ten minutes instead of forty. Decide by 2:15.

### [3] Contradiction module

```python
def detect(refs: list[ArtifactMeta]) -> Contradiction | None:
    for topic, group in group_by_topic(refs):
        pairs = [(a, b) for a, b in combinations(group, 2)
                 if abs((a.updated_at - b.updated_at).days) > 0]
        for a, b in pairs:
            if llm_says_conflicting(a.body, b.body):      # one cheap call
                newer, older = sorted([a, b], key=lambda x: x.updated_at, reverse=True)
                return Contradiction(newer=newer, older=older)
    return None
```

UI copy: *"Two sources disagree. **{newer.title}** ({date}) appears to supersede **{older.title}** ({date})."*

Word it as *appears to* — it's a heuristic, and saying so is more credible than overclaiming.

Cap the LLM judge at 3 pairs to bound latency.

### [4] Tavily

Only fires on explicit toggle. Rendered in a visually separate panel with an "External — not from company knowledge" label. Never merged into the grounded answer.

---

## 5. API Surface

| Method | Path | Behaviour |
|---|---|---|
| `POST` | `/ask` | `{question, use_web_search}` → answer + sources + path + contradiction |
| `POST` | `/sync` | Kicks off background job → `202 {job_id}` |
| `GET` | `/sync/{job_id}` | `{status: queued\|running\|done\|failed, per_source: [...]}` |
| `GET` | `/sources` | Per-source status + last sync time (drives UI pills) |
| `GET` | `/health` | Checks Neo4j + Postgres reachable |

Background job pattern: FastAPI `BackgroundTasks` writing state to a Postgres `jobs` table. Don't add Celery or Redis — a table and a status field is enough for four hours, and it survives a restart.

---

## 6. Deployment (Render)

```
Render Web Service  : company-brain-api   (Python/FastAPI, Docker or native)
Render Web Service  : company-brain-web   (Next.js)
Render Postgres     : cognee relational + pgvector + watermarks + jobs + artifacts
Neo4j Aura Free     : graph store (external, free tier)
```

### Environment variables

```dotenv
# LLM — one key covers both LLM and embeddings on Cognee defaults
LLM_API_KEY=sk-...
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini

# Graph
GRAPH_DATABASE_PROVIDER=neo4j
GRAPH_DATABASE_URL=neo4j+s://<id>.databases.neo4j.io
GRAPH_DATABASE_USERNAME=neo4j
GRAPH_DATABASE_PASSWORD=...

# Relational + vector → Postgres (NOT ephemeral disk)
DB_PROVIDER=postgres
VECTOR_DB_PROVIDER=pgvector
DB_HOST=... DB_PORT=5432 DB_NAME=... DB_USERNAME=... DB_PASSWORD=...

TAVILY_API_KEY=...
```

Confirm the exact Cognee env var names against current docs during setup — they shift between releases, and a typo here fails silently by falling back to local defaults, which is the exact failure you're trying to avoid.

### Two things that will bite you

1. **Config change requires pruning.** If you run locally on SQLite/LanceDB first and then switch to Postgres/pgvector, call `cognee.prune.prune_data()` and `prune_system(metadata=True)` before the next cognify. Skipping this produces a half-migrated store that fails in confusing ways.
2. **Cold starts.** Render free web services spin down after inactivity. Add an external uptime pinger hitting `/health` every 10 minutes from the moment you deploy. A judge should never be the request that wakes the service.

---

## 7. Failure Modes and Fallbacks

| Failure | Blast radius | Fallback |
|---|---|---|
| MCP connector down | One source missing | Skipped, logged, grey pill in UI; seed data unaffected |
| `include_references` unusable | Path + contradiction both break | Parallel `SearchType.CHUNKS` call for provenance |
| No Cypher path found | Path panel only | Hide panel, keep answer |
| Cognee search slow/times out | Whole answer | Serve cached answer for rehearsed questions |
| OpenAI rate limit mid-demo | Whole answer | Cache; plus a second API key on standby |
| Postgres connection lost | Everything | `/health` catches it before the judge does |
| Neo4j Aura idle-paused | Graph queries | Pinger keeps it warm too |

---

## 8. Revised Build Order

Written for parallel work. If you're solo, follow it top to bottom and cut section 9's stretch items first.

| Time | Track A (data + graph) | Track B (API + UI) |
|---|---|---|
| 0:00–0:30 | Aura + Render Postgres provisioned, Cognee configured, `prune` run | FastAPI + Next.js skeletons, `/health`, deploy both **now** while stakes are low |
| 0:30–1:00 | **Write the seed corpus** — the multi-hop chain and the contradiction must be deliberate, not hoped for | Canonical envelope, connector interface, `SeedFileConnector` |
| 1:00–1:30 | `add` + `cognify`, inspect graph in Neo4j Browser, confirm the chain resolved into real linked nodes | `/ask` wired to `GRAPH_COMPLETION`; **verify `include_references` output shape** |
| 1:30–2:15 | Cypher path query against the real graph | Contradiction module + Postgres metadata lookup |
| 2:15–3:00 | MCP connectors, best-effort, timeboxed hard — drop at 3:00 regardless of state | UI: answer, sources+dates, path trace, contradiction banner, Tavily toggle |
| 3:00–3:30 | `/sync` background job + watermarks | Pre-warm cache for rehearsed questions |
| 3:30–4:00 | Both: deploy, smoke-test the three demo questions end to end, write the 90-second script | |

**Deploy at 0:30, not 3:30.** Deployment failures on Render are environment-variable problems, and finding them at hour 3.5 is how teams lose demos they had already built.

---

## 9. Cut List (in order)

1. Tavily toggle
2. MCP connectors (seed data already proves the concept)
3. `/sync` UI — keep the endpoint, drop the front-end controls
4. Rendered graph visualization (text trace is sufficient)
5. Any question beyond the three rehearsed ones

**Never cut:** the contradiction flag or the Cypher-backed multi-hop trace. Those two are the entire argument of the problem statement. Everything else is decoration.

---

## 10. Open Risks

- **Cognee extraction quality on your seed corpus is unknown until hour 1.** Short, dense, unambiguous artifacts extract far better than realistic-sounding filler. If the chain doesn't resolve, rewrite the corpus to be more explicit rather than trying to tune Cognee.
- **`include_references` is load-bearing.** Two features depend on it. Validate its output shape before building either.
- **Postgres + pgvector under Cognee is less-travelled than the SQLite default.** Test the connection end-to-end in the first 30 minutes; if it fights you, a Render *persistent disk* with the default stores is the fastest escape hatch — worse than Postgres, far better than ephemeral.
