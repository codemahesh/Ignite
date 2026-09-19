# Ignite — PS-2 Company Brain

Architecture and planning docs for **Company Brain** (PS-2): a system that ingests
Confluence, Jira, SharePoint, and Slack content via MCP connectors, builds a
knowledge graph with [Cognee](https://github.com/topoteretes/cognee) (Postgres +
pgvector for relational/vector storage, Neo4j Aura for the graph), and answers
questions with sourced, date-aware, contradiction-checked responses — with an
optional live Tavily fallback for anything outside the ingested corpus.

## Contents

| File | What it is |
|---|---|
| [`PS-2_Company_Brain_Architecture (1).md`](<PS-2_Company_Brain_Architecture (1).md>) | v1 architecture — locked decisions, system diagram, ingestion/query design |
| [`PS-2_Architecture_v2_Dynamic_Connectors.md`](PS-2_Architecture_v2_Dynamic_Connectors.md) | v2 — reworks connectors into a runtime registry (catalog vs. registry), adds circuit breakers, retry/backoff, dead-letter queue, and a swappable job-queue interface for scalability/reliability |
| [`PS-2_Architecture_Review.md`](PS-2_Architecture_Review.md) | Senior review of the architecture, findings ranked Tier 1 (breaks the demo) → Tier 3 (polish), with concrete fixes |
| [`tasks.md`](tasks.md) | Implementation task list synthesizing v1 + v2 + the review's fixes, organized by phase and track (`BE`/`FE`/`OPS`) with dependencies and acceptance criteria |

## Key decisions (from the architecture)

- **Storage:** Postgres + pgvector (relational/vector), Neo4j Aura Free (graph) — not ephemeral disk, since Render wipes it on restart/deploy.
- **Answering:** Cognee's native `SearchType.GRAPH_COMPLETION`, no custom orchestration.
- **Contradiction detection:** query-time, over date metadata attached at ingest.
- **Sync:** incremental, watermark-based, run as a background job polled via status endpoint (cognify exceeds HTTP timeouts).
- **MCP connectors:** real credentials, non-blocking, capped per source (item count, age, timeout) so one slow/large source can't blow the time budget.
- **External search:** Tavily is opt-in only, so it's always clear to a viewer what's internal vs. external.

See `tasks.md` for current build status.
