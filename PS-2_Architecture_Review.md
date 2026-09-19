# PS-2 Architecture — Senior Review

Findings ranked by severity. Tier 1 breaks the demo. Tier 2 produces confidently wrong output, which is worse than breaking given the problem statement. Tier 3 is polish.

---

## TIER 1 — Will break the demo

### 1.1 There is no link from a Cognee reference back to your artifact ID

**This invalidates the central decoupling in the architecture.** The design says "keep dates in Postgres, look them up by artifact ID." But `cognee.add(data=artifact.body)` passes only the body string. Cognee mints its own document and chunk UUIDs. Nothing connects a returned reference to `jira:PLAT-412`.

Both the contradiction module and the path anchors depend on this resolution. Neither works as written.

**Fix — three redundant paths, use all of them:**

1. **Write artifacts to disk as `<artifact_id>.md` and pass the file path.** Cognee tracks document name/title, so the ID rides along in provenance.
   ```python
   safe_id = artifact.id.replace(":", "__")          # "jira__PLAT-412"
   path = TMP / f"{safe_id}.md"
   path.write_text(render(artifact))
   await cognee.add(str(path), dataset_name="company_brain", node_set=[...])
   ```
2. **Embed a machine-readable header inside the body text** so it survives chunking:
   ```
   <!-- artifact_id: jira:PLAT-412 | source: jira | date: 2025-06-12 -->
   # Deploy failure on platform service
   ...
   ```
   Regex `artifact_id:\s*([^\s|]+)` out of any returned chunk text.
3. **Tag `node_set=[f"artifact:{artifact.id}", f"source:{...}", f"topic:{...}"]`** as a third recovery route.

Whichever survives Cognee's internals, you have a mapping. Build the resolver as one function with three fallbacks and log which one fired.

### 1.2 Unbounded MCP fetch will consume the entire time budget

A real Jira project returns thousands of issues. A real Confluence space returns hundreds of pages. Each one costs an LLM extraction pass during cognify. A connector that quietly pulls 800 items turns a 90-second cognify into a 40-minute one, and you find out at hour 2.

**Fix — hard caps in the connector contract, not in each connector:**
```python
MAX_ITEMS_PER_SOURCE = 25
MAX_AGE = timedelta(days=180)
```
Enforce in the runner that calls `fetch()`, so no connector can opt out. Also wrap every `fetch()` in `asyncio.wait_for(..., timeout=20)` — a hanging MCP handshake blocks the whole sync, and "best-effort" means nothing without a timeout.

### 1.3 Multiple uvicorn workers will fragment your in-process state

Render's default start command often sets `--workers > 1`. Your background job registry, your pre-warm cache, and any in-memory state then exist per-worker. `/sync` starts a job in worker 1; the status poll lands on worker 2 and returns 404. The cache warms in one worker and misses in the others.

**Fix:** pin `--workers 1` explicitly in the start command. Non-negotiable for a 4-hour build.

### 1.4 CORS is not configured anywhere

Next.js on `company-brain-web.onrender.com` calling FastAPI on `company-brain-api.onrender.com` is cross-origin. Without `CORSMiddleware` the browser blocks every request, and the error surfaces as a generic network failure that reads like the backend is down.

```python
app.add_middleware(CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN], allow_methods=["*"], allow_headers=["*"])
```

Wire this at 0:30 during the first deploy, not later. Also set `NEXT_PUBLIC_API_BASE_URL` — without the `NEXT_PUBLIC_` prefix it's undefined in the browser and you'll debug the wrong layer.

### 1.5 Concurrent `/sync` calls can corrupt the dataset

Two overlapping cognify runs on the same dataset is undefined behaviour and unnecessary risk.

**Fix:** Postgres advisory lock. Four lines, removes the whole class of problem.
```python
got = await conn.fetchval("SELECT pg_try_advisory_lock($1)", SYNC_LOCK_KEY)
if not got:
    return JSONResponse({"error": "sync already running"}, 409)
```
Same lock guards the startup seed ingest, which otherwise double-ingests on a restart mid-deploy.

---

## TIER 2 — Will produce wrong output

### 2.1 `shortestPath` will find the most trivial connection, not the interesting one

This is the subtlest bug in the plan and the one most likely to embarrass you on stage.

Cognee's graph is dense with shared entity nodes. Between your policy doc and your incident ticket, the shortest path is almost certainly something like:

```
Policy_v1 → Entity("engineer") → Incident_Ticket
```

Two hops, technically a path, semantically worthless — and it renders in your UI looking exactly like the meaningful chain. `shortestPath` is actively biased toward hub nodes, which are precisely the meaningless connectors.

**Fix — three changes:**
1. **Exclude hub nodes.** Compute degree once after cognify, exclude anything above a threshold:
   ```cypher
   MATCH p = shortestPath((a)-[*..4]-(b))
   WHERE none(n IN nodes(p) WHERE size((n)--()) > 15)
   ```
2. **Prefer semantic relationships.** After inspecting your real graph in Neo4j Browser, whitelist the relationship types that carry meaning and exclude generic containment edges (`HAS_CHUNK`, `PART_OF`, `CONTAINS` and similar).
3. **Return several paths, pick the best.** Drop `shortestPath`, use `allShortestPaths` or a bounded `MATCH p = (a)-[*2..4]-(b) ... LIMIT 10`, then rank by a simple score: longer is better, fewer high-degree nodes is better, whitelisted relationship types are better.

**You cannot write this query before you have looked at the actual graph.** Budget 15 minutes in Neo4j Browser at 1:00 to inspect node labels, relationship types, and the `id` property name before writing any Cypher.

### 2.2 The relationship type may be a property, not a Neo4j type

Cognee's own examples read `relationship_name` off the edge object, which suggests edges may carry a generic Neo4j type with the semantic name in a property. If so, `type(r)` in your Cypher returns something like `__RELATIONSHIP__` for every hop and your path trace renders as meaningless arrows.

**Fix:** `RETURN [r IN relationships(p) | coalesce(r.relationship_name, type(r))]`. Costs nothing, covers both cases.

### 2.3 Contradiction detection only sees what the answer already retrieved

The module inspects the references that backed the answer. But if the retriever surfaced only the newer policy — which is likely, since it's usually the better semantic match — there is no second source in the reference set, and no contradiction is detected.

Your headline feature silently no-ops, and it no-ops *specifically* in the case where one document cleanly dominates, which is common.

**Fix: run a separate, targeted conflict retrieval.** Don't reuse the answer's references.
```python
candidates = await cognee.search(
    query_text=question,
    query_type=SearchType.CHUNKS,
    datasets=["company_brain"],
    top_k=20,                 # wide net, cheap, no LLM completion
)
```
Resolve those to artifact IDs, group by topic, then run the pairwise conflict judge. Retrieval for *answering* and retrieval for *conflict detection* have different objectives — answering wants precision, conflict detection wants recall. Using one retrieval for both is the design error.

### 2.4 The answer and the contradiction banner can disagree with each other

GRAPH_COMPLETION generates the answer before you know a conflict exists. It may confidently assert the stale policy while your banner says a newer source supersedes it. A judge reading both sees an incoherent system.

**Fix:** when a conflict is detected, regenerate with an instruction:
```python
answer = await cognee.search(
    query_text=question,
    query_type=SearchType.GRAPH_COMPLETION,
    system_prompt=(
        "Sources conflict on this question. Acknowledge both positions, "
        "state which is more recent, and prefer the more recent one. "
        "Do not silently pick a side."
    ),
)
```
One extra call, only on the conflict path. Turns your weakest demo moment into the strongest one.

### 2.5 The date filter drops same-day conflicts and truncates

```python
if abs((a.updated_at - b.updated_at).days) > 0
```
Two contradicting documents published the same day are filtered out before the judge ever sees them. And `.days` truncates — 18 hours apart evaluates to 0.

**Fix:** remove the date filter entirely. Filter on *topic match*, judge conflict on *content*, use dates only for ordering. When dates tie, say so honestly: *"These sources disagree and share a date — recency can't resolve this one."* That's a better answer than silence, and it's a more credible claim about what the system knows.

### 2.6 Same-artifact revisions will be detected as contradictions

Incremental sync re-adds a changed Confluence page. The old version's nodes are still in the graph. Now v1 and v2 of the *same* artifact contradict each other, and your banner reports a document superseding itself.

**Fix:** treat a changed artifact as delete-then-add. Call `cognee.delete()` for the prior document before re-adding, and in the conflict module skip any pair where `a.id == b.id`. Both — the first is correct, the second is the safety net for when the delete doesn't fully propagate.

### 2.7 Timezone handling will throw at runtime

Mixing naive and aware datetimes raises `TypeError: can't compare offset-naive and offset-aware datetimes`. MCP sources return ISO strings with offsets; hand-written seed data usually doesn't. This crashes in the date-sort inside the contradiction module — the single place you most need not to crash.

**Fix:** normalize to UTC-aware at the connector boundary. One helper, applied in the normalizer, no exceptions:
```python
def utc(dt): return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
```

### 2.8 Watermark advancement is ordered wrong

Adds happen per source, but cognify is a single shared step. If you advance watermarks after `add` and cognify then fails, those items are recorded as synced but never indexed — and incremental sync will never pick them up again. Permanently invisible data.

**Correct order:** fetch all → add all → cognify once → *then* advance watermarks for every source whose fetch succeeded. Also use `updated_at >= since` with content-hash dedupe rather than `>`, or you drop items sharing a timestamp with the watermark.

### 2.9 `topic` has no assignment mechanism

The envelope has a `topic` field and the contradiction module groups by it, but nothing populates it. Seed data you control; Jira and Confluence have no such field.

**Fix:** fixed taxonomy of 6–8 topics, one cheap LLM classification call per artifact at ingest, stored in Postgres and mirrored into `node_set`. Batch the classification — one call for 25 artifacts, not 25 calls.

---

## TIER 3 — Nuances worth knowing

### 3.1 Cognee's graph completion is a 1-hop retriever

Per current docs, `GRAPH_COMPLETION` runs vector seeds → **1-hop** traversal → triplet ranking → completion. Your multi-hop requirement is therefore satisfied by your Cypher panel, not by Cognee's retriever. That's fine architecturally, but it means the Cypher panel is load-bearing for a judging criterion, not a nice-to-have.

There are deeper graph-completion variants available. Check what your installed version exposes and A/B one against the default at 1:15 — if a deeper mode resolves the chain in the answer itself, you get the multi-hop story twice over.

### 3.2 Slack should be thread-aggregated, not message-per-artifact

One artifact per message produces hundreds of three-word nodes that add noise and cognify cost while carrying no meaning. Aggregate a thread into a single artifact: title from the root message, body as the concatenated exchange, `updated_at` from the last reply.

### 3.3 `/ask` latency needs staged rendering

Answer + Cypher + conflict retrieval + judge + optional Tavily lands around 8–15 seconds. One blocking call means a judge watching a spinner.

**Fix — two-phase, cheap to build:** `/ask` returns the answer and a `trace_id` as soon as GRAPH_COMPLETION resolves. The frontend immediately calls `/ask/{trace_id}/details` for path and contradiction, filling those panels as they arrive. The answer paints in ~3 seconds and the graph evidence lands after. Also better theatre — the path animating in *after* the answer reads as the system showing its work.

### 3.4 Cache key must include the toggle

`cache[question]` returns the wrong payload when `use_web_search` flips. Key on `(normalized_question, use_web_search)`. Also warm the cache on startup, not just on deploy, or a restart leaves you cold.

### 3.5 `/sync` should be authenticated

An open endpoint that triggers LLM spend. A shared-secret header is thirty seconds of work.

### 3.6 Postgres connection limits

Render's free Postgres tier has a low connection cap, and both Cognee and your app pool against it. Set `pool_size=3, max_overflow=2`. Connection exhaustion presents as intermittent hangs, which is a miserable thing to debug under time pressure.

### 3.7 Pin the embedding model

pgvector columns are created with a fixed dimension. Switching embedding models later means a dimension mismatch and a full re-index. Set `EMBEDDING_MODEL` explicitly at the start and don't touch it.

### 3.8 Orphaned background jobs

`BackgroundTasks` runs in-process. A restart mid-cognify leaves a row stuck at `running` forever. Either mark jobs older than 10 minutes as `failed` on startup, or accept it and know what you're looking at.

---

## Revised validation checkpoints

Insert these as hard gates. Each one fails cheap now and expensive later.

| Time | Gate | If it fails |
|---|---|---|
| 0:45 | Postgres + pgvector + Neo4j all reachable; trivial `add`/`cognify`/`search` round-trips | Fall back to Render persistent disk with default stores |
| 1:00 | **Inspect the real graph in Neo4j Browser.** Node labels, `id` property name, relationship types, hub degrees | You cannot write Cypher without this |
| 1:15 | `include_references` returns something that resolves to an artifact ID via one of the three routes | Switch to `SearchType.CHUNKS` for provenance |
| 1:30 | A hand-written Cypher path between two known artifacts returns something *semantically meaningful* | Drop to `SearchType.INSIGHTS` triplets |
| 2:00 | Conflict retrieval surfaces both policy versions for the demo question | Widen `top_k`, or make the seed docs more lexically similar |

Gate at 1:00 is the one teams skip. Skipping it means writing Cypher against an imagined schema, which is the most reliable way to lose an hour.

---

## Summary of changes to the architecture

| Area | Change |
|---|---|
| Ingestion | Artifact ID carried three ways: filename, inline header comment, `node_set` |
| Ingestion | Hard caps + per-connector timeouts enforced by the runner |
| Ingestion | Delete-before-re-add on revision; thread-aggregate Slack; batch topic classification |
| Contradiction | Separate wide `CHUNKS` retrieval, not the answer's references |
| Contradiction | Drop the date filter; dates order results, they don't gate detection |
| Contradiction | Regenerate the answer with a conflict-aware system prompt |
| Path | Ranked candidate paths with hub exclusion, not bare `shortestPath` |
| Path | `coalesce(r.relationship_name, type(r))` for edge labels |
| API | Two-phase `/ask` + `/ask/{trace_id}/details` |
| API | Advisory lock on sync and startup seed; shared-secret auth on `/sync` |
| Ops | `--workers 1`, CORS, UTC normalization, pinned embedding model, small pool |
