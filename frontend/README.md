# Company Brain - Frontend

A Next.js application for the Company Brain knowledge graph interface.

## Architecture Reference

This frontend implements the UI components defined in:
- `wireframes.md` - UI wireframes and component specifications
- `PS-2_Company_Brain_Architecture (1).md` - Core architecture
- `PS-2_Architecture_v2_Dynamic_Connectors.md` - Dynamic connector system

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Ask page (/)
│   ├── connectors/
│   │   └── page.tsx       # Connectors page (/connectors)
│   ├── layout.tsx         # Root layout with Shell
│   └── globals.css        # Global styles
├── components/
│   ├── ask/               # Ask page components
│   │   ├── ask-box.tsx
│   │   ├── answer-panel.tsx
│   │   ├── contradiction-banner.tsx
│   │   ├── external-results-panel.tsx
│   │   ├── rehearsed-question-chips.tsx
│   │   ├── relationship-path-trace.tsx
│   │   ├── source-coverage-line.tsx
│   │   ├── source-list.tsx
│   │   └── web-search-toggle.tsx
│   ├── connectors/        # Connector page components
│   │   ├── confirm-dialog.tsx
│   │   ├── connect-modal.tsx
│   │   ├── connector-card.tsx
│   │   ├── dead-letter-list.tsx
│   │   └── live-sync-panel.tsx
│   ├── layout/            # Layout components
│   │   ├── shell.tsx
│   │   └── system-status-pill.tsx
│   └── ui/                # shadcn/ui components
├── hooks/                 # Custom React hooks
│   ├── use-ask.ts         # Ask/query hook
│   ├── use-connectors.ts  # Connector management hooks
│   ├── use-health.ts      # System health hook
│   └── use-sources.ts     # Source status hook
├── lib/
│   ├── api.ts             # API client
│   └── utils.ts           # Utility functions
└── types/
    └── api.ts             # TypeScript types for API
```

## API Integration

All API types are defined in `src/types/api.ts` matching the backend schema.

### Hooks

| Hook | Purpose |
|------|---------|
| `useHealth` | Monitor system health (polls `/ready`) |
| `useAsk` | Two-phase ask flow (`POST /ask` + `GET /ask/{trace_id}/details`) |
| `useSources` | Source coverage data (`GET /sources`) |
| `useConnectors` | Connector catalog and registry |
| `useCreateConnector` | Create new connector |
| `useConnectorActions` | Sync, disable, remove connectors |
| `useJobStatus` | Poll sync job progress |
| `useDeadLetters` | Fetch dead letters for a connector |

### API Endpoints (from backend)

| Endpoint | Hook | Description |
|----------|------|-------------|
| `GET /health` | `useHealth` | Process alive check |
| `GET /ready` | `useHealth` | Full dependency check |
| `POST /ask` | `useAsk` | Submit question (fast path) |
| `GET /ask/{trace_id}/details` | `useAsk` | Get path + contradiction (slow path) |
| `GET /sources` | `useSources` | Source status and counts |
| `GET /connectors/catalog` | `useConnectors` | Available connector types |
| `GET /connectors` | `useConnectors` | Connected instances |
| `POST /connectors` | `useCreateConnector` | Create + validate connector |
| `POST /connectors/{id}/sync` | `useConnectorActions` | Start sync job |
| `POST /connectors/{id}/disable` | `useConnectorActions` | Disable connector |
| `DELETE /connectors/{id}` | `useConnectorActions` | Remove connector |
| `GET /jobs/{job_id}` | `useJobStatus` | Job progress |

## Component Library

Uses [shadcn/ui](https://ui.shadcn.com/) with base-ui-react primitives.

## Features Mapping (from wireframes.md)

### Ask Page (`/`)
- ✅ AskBox - Question input with submit
- ✅ WebSearchToggle - Tavily opt-in
- ✅ RehearsedQuestionChips - Pre-loaded demo questions
- ✅ SourceCoverageLine - Artifact count and sources
- ✅ AnswerPanel - Answer display
- ✅ ContradictionBanner - Conflict detection alert
- ✅ RelationshipPathTrace - Cypher path visualization
- ✅ SourceList - Referenced sources with links
- ✅ ExternalResultsPanel - Tavily web results

### Connectors Page (`/connectors`)
- ✅ ConnectorCatalogGrid - Available and connected connectors
- ✅ ConnectorCard - State display (all 8 states)
- ✅ ConnectModal - Dynamic credential form
- ✅ LiveSyncPanel - Progress tracking (fetched/ingested/cognified)
- ✅ DeadLetterList - Failed item details
- ✅ ConfirmDialog - Disable/Remove confirmations

### Global Shell
- ✅ Navigation (Ask / Connectors tabs)
- ✅ SystemStatusPill - Health indicator
- ✅ Issue badge on Connectors tab

## Development Notes

1. **No `asChild` prop**: The shadcn/ui components use base-ui-react which doesn't support the `asChild` prop. Components are styled directly.

2. **Type casting**: API responses are cast to strict types since the API returns `string` but TypeScript expects literal types.

3. **Two-phase ask**: The answer loads first (`POST /ask`), then details (path, contradiction) load separately (`GET /ask/{trace_id}/details`).

4. **Polling**: Job status and connectors poll at intervals; sources poll less frequently.
