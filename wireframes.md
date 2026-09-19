# Company Brain — Low-Fidelity Wireframes

Covers every page, state, and feature described in the architecture docs
(`PS-2_Company_Brain_Architecture (1).md` v1 + `PS-2_Architecture_v2_Dynamic_Connectors.md` v2)
and mapped to the API surface in v2 §6. ASCII layout blocks are literal —
each box is one region, dimensions are relative, not pixel-exact.

Two pages, one shared shell:

1. **Ask** (`/`) — query the knowledge graph
2. **Connectors** (`/connectors`) — manage data sources

---

## 0. Global Shell

Present on every page.

```
┌──────────────────────────────────────────────────────────────────────┐
│  🧠 Company Brain        [ Ask ]  [ Connectors ]        ● Ready      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Logo/wordmark** — left, links to `/`.
- **Nav tabs** — `Ask` / `Connectors`. Active tab underlined. Connectors tab shows a small red dot badge if any connector is `FAILED` or `DEGRADED`.
- **System status pill** — right. Backed by `GET /ready`.
  - `● Ready` (green) — Neo4j + Postgres + Cognee all reachable.
  - `● Degraded` (amber) — one dependency down; tooltip names which.
  - `● Down` (red) — click opens a plain-text dump of `/ready`'s response, for you to read off during a live break-fix.
- No auth/login screen — out of scope (single shared-secret header for mutating connector calls, no user-facing login UI).

---

## 1. Ask Page (`/`)

### 1.1 Empty state (first load, no question asked yet)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🧠 Company Brain        [ Ask ]  [ Connectors ]        ● Ready       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Ask anything about your company's knowledge                        │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ e.g. "Why did the platform deploy fail last week?"           │    │
│  │                                                          [Ask]│    │
│  └──────────────────────────────────────────────────────────────┘    │
│   ☐ Include live web search (Tavily)                                 │
│                                                                        │
│   Try a rehearsed question:                                           │
│   [ Why did PLAT-412 happen? ]  [ What's our leave policy? ]          │
│   [ Who owns onboarding docs? ]                                       │
│                                                                        │
│   Answering from 47 artifacts across Seed + Jira · Sources ▾          │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

Components:
- `AskBox` — single-line-growing textarea, `⏎` or **Ask** button submits. Disabled while a request is in flight.
- `WebSearchToggle` — checkbox/switch, off by default (v1 decision #11: explicit opt-in only). Disabled with a tooltip ("Tavily not configured") if `TAVILY_API_KEY` is unset — mirrors v2 §4.5 degradation matrix ("Tavily down → toggle disabled with reason").
- `RehearsedQuestionChips` — pre-loaded buttons for the demo's known-good questions (pulls from the pre-warmed cache, v1 decision #13). Clicking one fills + submits the ask box.
- `SourceCoverageLine` — *"Answering from **N** artifacts across **Seed + Jira**."* (v2 §7). Backed by `GET /sources`. `Sources ▾` expands the per-source pill row (see 1.4).

### 1.2 Loading state

```
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Why did PLAT-412 happen?                                [...]│    │
│  └──────────────────────────────────────────────────────────────┘    │
│   ☑ Include live web search (Tavily)                                 │
│                                                                        │
│   ░░░░░░░░░░░░░░░░░░░░░░░░  Thinking…                                │
│   Answer panel, path trace, and contradiction check load             │
│   independently as each one resolves.                                │
```

- Answer, path-trace, and contradiction panels each render their own skeleton and resolve independently — matches the backend's two-phase model (`POST /ask` fast path → `GET /ask/{trace_id}/details` slow path, v2 §6). Answer typically appears first; path + contradiction pop in after.
- If `/ask` exceeds its 25s budget (v2 §4.3), fall back silently to a cached response for rehearsed questions and show the degraded banner below.

### 1.3 Answered state — full layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🧠 Company Brain        [ Ask ]  [ Connectors ]        ● Ready       │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Why did PLAT-412 happen?                                 [Ask]│    │
│  └──────────────────────────────────────────────────────────────┘    │
│   ☑ Include live web search (Tavily)          [ New question ]       │
│                                                                        │
│  ⚠ Serving a cached response (rate limit reached)      ← optional    │
│                                                                        │
│  ── Answer ────────────────────────────────────────────────────────  │
│  │ The platform deploy failed because the rollback runbook was      │
│  │ superseded by an undocumented config change made two days        │
│  │ earlier. [1] [2]                                                 │
│                                                                        │
│  ⚠ Two sources disagree                                              │
│  │ "Deploy Runbook v3" (Jun 12, 2025) appears to supersede          │
│  │ "Deploy Runbook v2" (Mar 4, 2025).            [ View both → ]    │
│                                                                        │
│  ── Relationship path ───────────────────────────────────────────    │
│  │ Deploy Runbook v2 --[SUPERSEDED_BY]--> Deploy Runbook v3          │
│  │                    --[CAUSED]--> Incident PLAT-412                │
│                                                                        │
│  ── Sources (2) ───────────────────────────────────────────────────  │
│  │ [J] PLAT-412 — Jira · updated Jun 14, 2025          [Open ↗]     │
│  │ [C] Deploy Runbook v3 — Confluence · updated Jun 12, 2025 [↗]    │
│                                                                        │
│  ── External (Tavily) ───────────────────── "Not from company data" ─│
│  │ [W] "Common causes of Kubernetes rollback failures" — example.com│
│  │ [W] "..." — example.com                                          │
│                                                                        │
│   Answering from 47 artifacts across Seed + Jira · Sources ▾          │
└──────────────────────────────────────────────────────────────────────┘
```

Panel-by-panel:

| Panel | Shows | Hides when | Backed by |
|---|---|---|---|
| **Answer** | `cognee.search(GRAPH_COMPLETION)` text, inline `[1] [2]` reference markers | Never (always renders, or an error state) | `POST /ask` |
| **Contradiction banner** | *"{newer.title} ({date}) appears to supersede {older.title} ({date})"* — amber, dismissible | No conflicting pair found | `GET /ask/{trace_id}/details` §3 |
| **Relationship path** | Rendered chain `A --[REL]--> B --[REL]--> C` | No path within 4 hops (never fabricate) | `GET /ask/{trace_id}/details` §2 |
| **Sources** | One row per reference: source-type icon, title, updated date, external link | Never if answer has references | `POST /ask` refs → Postgres metadata |
| **External (Tavily)** | Visually separate card, explicit *"Not from company knowledge"* label, never merged into grounded answer | Toggle was off | `POST /ask` step 4 |
| **Degraded banner** | *"Serving a cached response"* / *"Answering with reduced sources"* | Everything healthy | v2 §4.5 degradation matrix |

Interaction notes:
- Clicking `[1]`/`[2]` in the answer text scroll-highlights the matching row in **Sources**.
- `View both →` on the contradiction banner opens a side-by-side diff-style panel (not modeled separately — inline expand is enough for a 4-hour build).
- **New question** clears state and refocuses the ask box; keeps the last answer collapsed below (scrollback) rather than destroying it.

### 1.4 Source-coverage expansion (`Sources ▾`)

```
│   Answering from 47 artifacts across Seed + Jira · Sources ▲          │
│   ● Seed  12       ● Jira  35        ○ Confluence  unavailable        │
│                                       ○ SharePoint  not connected     │
│                                       ○ Slack       not connected     │
```

- Green filled dot + count = synced and contributing.
- Grey hollow dot = unavailable/not connected — reads as resilience, not failure (v1 §3 "Non-blocking MCP").
- Backed by `GET /sources`.

### 1.5 Empty/no-answer state

```
│  ── Answer ────────────────────────────────────────────────────────  │
│  │ No grounded answer found in the connected sources.                │
│  │ Try enabling live web search, or ask a narrower question.         │
│  │                                          [ ☐ → ☑ Enable Tavily ]  │
```

---

## 2. Connectors Page (`/connectors`)

### 2.1 Catalog grid — default view

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🧠 Company Brain        [ Ask ]  [ Connectors ]        ● Ready       │
├──────────────────────────────────────────────────────────────────────┤
│  Connectors                                                           │
│  Data sources feeding the knowledge graph. Connect one to grow it.    │
│                                                                        │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────┐│
│  │ 📄 Seed Files  │ │ 🧩 Jira        │ │ 📘 Confluence  │ │ 💬 Slack  ││
│  │ ● Synced       │ │ ● Synced       │ │ ○ Available    │ │○ Available││
│  │ 12 artifacts   │ │ 35 artifacts   │ │                │ │           ││
│  │ synced 2m ago  │ │ synced 2m ago  │ │                │ │           ││
│  │ 0 dead-letters │ │ 0 dead-letters │ │                │ │           ││
│  │ [Sync now]     │ │ [Sync now] ⋯   │ │   [Connect]    │ │[Connect]  ││
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────┘│
│  ┌───────────────┐ ┌───────────────────────────────────────────────┐│
│  │ 📂 SharePoint  │ │ 🧪 Generic MCP (experimental)                 ││
│  │ ✕ Failed       │ │ Point at any MCP server; field mapping is     ││
│  │ Invalid token  │ │ LLM-proposed and ships disabled by default.   ││
│  │ [Retry]  ⋯     │ │                                    [Connect]  ││
│  └───────────────┘ └───────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

`ConnectorCard` anatomy (fixed regions, same for every state):

```
┌───────────────┐
│ {icon} {name} │   ← catalog display_name
│ {state pill}  │   ← see state table below
│ {stat line 1} │   ← artifact count, or error summary, or blank
│ {stat line 2} │   ← last sync time, or dead-letter count
│ [action(s)] ⋯ │   ← primary button + overflow menu
└───────────────┘
```

State → pill → stat lines → actions (drives directly off the v2 §2.2 lifecycle):

| State | Pill | Stat lines | Primary action | Overflow menu `⋯` |
|---|---|---|---|---|
| `AVAILABLE` | `○ Available` (grey) | — | **Connect** | — |
| `VALIDATING` | `◐ Validating…` (blue, spinner) | "Checking credentials" | — (disabled) | Cancel |
| `FAILED` | `✕ Failed` (red) | last_error text, truncated | **Retry** | Edit credentials · Remove |
| `CONNECTED` | `● Connected` (green, unsynced) | "Never synced" | **Sync now** | Disable · Remove |
| `SYNCING` | `◐ Syncing…` (blue, animated) | live counters (see 2.3) | — (disabled) | View progress |
| `SYNCED` | `● Synced` (green) | "N artifacts", "synced Xm ago" | **Sync now** | Disable · Remove |
| `DEGRADED` | `◐ Degraded` (amber) | "N artifacts · M failed" | **Sync now** | View dead letters · Disable · Remove |
| `DISABLED` | `⏸ Disabled` (grey) | "Data retained · N artifacts" | **Enable** | Remove |
| breaker open (any synced state) | small `⚡ circuit open` sub-badge next to the pill | cooldown countdown | disabled until cooldown | — |

Backed by `GET /connectors/catalog` (available types) + `GET /connectors` (connected instances, state, counts, breaker status — v2 §6).

### 2.2 Connect modal

Triggered by **Connect** on an `AVAILABLE` card.

```
┌──────────────────────────────────────────────┐
│  Connect Jira                            [×]  │
├──────────────────────────────────────────────┤
│  Site URL                                      │
│  ┌──────────────────────────────────────────┐ │
│  │ https://yourcompany.atlassian.net         │ │
│  └──────────────────────────────────────────┘ │
│  API Token                                     │
│  ┌──────────────────────────────────────────┐ │
│  │ ••••••••••••••••••••••••              👁  │ │
│  └──────────────────────────────────────────┘ │
│  Project key                                   │
│  ┌──────────────────────────────────────────┐ │
│  │ PLAT                                      │ │
│  └──────────────────────────────────────────┘ │
│                                                 │
│  Credentials are encrypted at rest and never   │
│  shown again after saving.                     │
│                                                 │
│                       [ Cancel ]  [ Validate & Connect ] │
└──────────────────────────────────────────────┘
```

- Fields generated dynamically from the catalog entry's `credential_fields` (v2 §2.1) — text input for non-secret fields, password input with reveal toggle for `secret: true` fields.
- **Validate & Connect** disables and shows inline spinner → calls `POST /connectors` → card moves to `VALIDATING` in the background grid.
- On validation failure, the modal stays open and shows the error inline under the offending field (or as a banner if not field-specific) rather than closing — this is the "learn your token is wrong immediately" requirement from v2 §2.2.
- On success, modal closes, toast: *"Jira connected. Ready to sync."*

### 2.3 Live sync panel

Opened via **Sync now**, or auto-opens when a card enters `SYNCING`. Rendered as a slide-over drawer so the catalog grid stays visible behind it.

```
┌──────────────────────────────────────────────┐
│  Syncing Jira                            [×]  │
├──────────────────────────────────────────────┤
│  Fetched     ████████████████░░░░   82 / 100  │
│  Ingested    ███████████░░░░░░░░░   61 / 100  │
│  Cognified   ██████░░░░░░░░░░░░░░   34 / 100  │
│  Failed      2                                 │
│                                                 │
│  ⏱ Elapsed 00:47          Status: running      │
│                                                 │
│  Recent activity                               │
│  ✓ PLAT-418 ingested                           │
│  ✓ PLAT-417 ingested                           │
│  ✕ PLAT-403 failed — normalize error   [View]  │
│  ✓ PLAT-416 fetched                            │
│                                                 │
│                                    [ Run in background ] │
└──────────────────────────────────────────────┘
```

- Three stacked progress bars: **Fetched → Ingested → Cognified**, matching the parallel-fetch/serialized-cognify pipeline (v2 §3.1) — this is called out in the docs as *"the visual that sells the whole system"* (v2 §7), so it gets the most layout weight of any single component.
- Polls `GET /jobs/{job_id}` at 1s, or subscribes to `GET /jobs/{job_id}/stream` (SSE) if available — same visual either way, polling is the fallback per the cut list (v2 §8).
- **Failed** counter is a link → opens the dead-letter list (2.4) filtered to this job.
- **Run in background** closes the drawer without cancelling the job; the card's pill keeps animating and a small progress ring appears on the Connectors nav tab.
- On completion: bars fill, status flips to `Done` / `Done with N failures`, drawer gets a **Close** button, card updates to `SYNCED` or `DEGRADED`.

### 2.4 Dead-letter list

Opened from a `DEGRADED` card's overflow menu, or from the sync panel's **Failed** link.

```
┌──────────────────────────────────────────────┐
│  Jira — 2 failed items                   [×]  │
├──────────────────────────────────────────────┤
│  PLAT-403                                      │
│  Stage: normalize                              │
│  Error: missing required field "updated_at"    │
│  2m ago                                        │
│  ─────────────────────────────────────         │
│  PLAT-390                                      │
│  Stage: cognify                                │
│  Error: request timed out after 300s           │
│  8m ago                                        │
└──────────────────────────────────────────────┘
```

- Read-only list, no retry-per-item action in scope (v1/v2 don't spec one) — closing this loop is "next sync will re-attempt."
- Backed by the `dead_letters` table (v2 §3.3), surfaced via the connector's detail response.

### 2.5 Disable / Remove confirmation

Two distinct destructive-ish actions per v2 §1 ("Disconnect vs Remove") — must not be collapsed into one button.

```
┌──────────────────────────────────────┐      ┌──────────────────────────────────────┐
│  Disable Jira?                  [×]  │      │  Remove Jira?                    [×]  │
├────────────────────────────────────  │      ├────────────────────────────────────  │
│  Syncing stops. Already-ingested      │      │  This permanently deletes 35          │
│  data stays in the graph and is       │      │  artifacts and their graph nodes.     │
│  still answerable.                    │      │  This cannot be undone.               │
│                                        │      │                                        │
│           [ Cancel ]  [ Disable ]     │      │           [ Cancel ]  [ Remove ]      │
└──────────────────────────────────────┘      └──────────────────────────────────────┘
```

- **Disable** → `POST /connectors/{id}/disable` → card → `DISABLED`, data untouched.
- **Remove** → `DELETE /connectors/{id}` → purges that connector's Cognee nodes + Postgres rows (`cognee_doc_id`-scoped, v2 §3.2) → card reverts to `AVAILABLE`. Confirmation button styled as destructive (red).

---

## 3. Cross-cutting states

### 3.1 Connector isolation demo state

The one thing the docs call out as a live-demo requirement (v2 §9, "Kill one. Don't describe it."): killing a single connector must visibly isolate to one red card while everything else — including the Ask page — keeps working.

```
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ 📄 Seed Files  │ │ 🧩 Jira        │ │ 📘 Confluence  │ │ 💬 Slack       │
│ ● Synced       │ │ ✕ Failed       │ │ ● Synced       │ │ ○ Available    │
│ 12 artifacts   │ │ ⚡ circuit open │ │ 9 artifacts    │ │                │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
```

No separate screen — this is the catalog grid's normal per-card rendering doing its job. Worth stating explicitly in the wireframe because it's the moment judges are told to watch for.

### 3.2 Cut-list-aware rendering

Per both docs' cut lists, these features must degrade to *"hidden," not "broken"* if time runs out:

| If not built | Ask page shows | Connectors page shows |
|---|---|---|
| Tavily | Web-search toggle omitted entirely (not shown disabled) | — |
| `/sync` UI | — | Card still shows synced state; **Sync now** button hidden, sync is seed-time only |
| SSE streaming | Live sync panel falls back to 1s polling — identical visual | |
| Generic MCP | "Generic MCP (experimental)" card omitted from grid | |
| Connectors 2–4 as real integrations | Source-coverage line only ever shows Seed + Jira | Confluence/SharePoint/Slack cards stay `AVAILABLE` forever (honest, not hidden — v2 "catalog entries that validate and fail cleanly") |

### 3.3 Error/edge states not tied to a specific panel

- **`/ask` request fails outright (network/5xx):** inline red banner above the ask box — *"Something went wrong. Try again."* — with a **Retry** button that resubmits the same question. Answer/path/sources panels do not render.
- **Cold-start delay** (Render free tier spin-up): if `/health` takes >3s on first paint, show a thin top-of-page loading bar with *"Waking up the service…"* rather than a blank page.
- **No connectors configured at all (fresh deploy):** Ask page's empty state still works off seed data; Connectors page grid shows all cards as `AVAILABLE`.

---

## 4. Component inventory

Flat list of every reusable piece referenced above, for whoever builds the FE:

- `AskBox`
- `WebSearchToggle`
- `RehearsedQuestionChips`
- `SourceCoverageLine` (+ expanded per-source pill row)
- `AnswerPanel`
- `ContradictionBanner`
- `RelationshipPathTrace`
- `SourceList` / `SourceRow`
- `ExternalResultsPanel` (Tavily)
- `DegradedBanner` (cached response / reduced sources)
- `SystemStatusPill` (nav bar)
- `ConnectorCatalogGrid`
- `ConnectorCard` (all 8 states from §2.1)
- `ConnectModal` (dynamic fields from catalog spec)
- `LiveSyncPanel` (3-counter progress + activity feed)
- `DeadLetterList`
- `ConfirmDialog` (shared, used for Disable and Remove with different copy/severity)

## 5. Explicitly out of scope (no wireframe needed)

Per both docs' "Honest Non-Goals" / cut lists — do not design screens for:

- OAuth connect flow (paste-a-token only)
- User accounts / login / multi-tenant switcher
- Per-item retry inside the dead-letter list
- A rendered graph visualization (text trace is sufficient — v1 §9 cut list item 4)
- `/metrics` dashboard as a UI (numbers are quoted verbally in the pitch, not shown on screen)
