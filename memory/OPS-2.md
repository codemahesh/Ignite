# OPS-2 — Uptime pinger

**Status: [~] blocked on deployment. The buildable part (pinger mechanism) is done and independently verified.**

## What was built

`.github/workflows/keep-alive.yml` — GitHub Actions workflow:
- Triggers: `schedule: cron "*/10 * * * *"` (every 10 minutes) + `workflow_dispatch` (manual run button, useful for testing after deploy without waiting for the cron).
- Reads the URL to ping from the `HEALTH_CHECK_URL` **repository variable** (Settings → Secrets and variables → Actions → Variables), not hardcoded — so activating it post-deploy is a one-line config change, no code/PR needed.
- If that variable is unset (true right now, pre-deploy), the job no-ops cleanly (prints a message, `exit 0`) instead of failing/spamming red X's on every run.
- If set, curls it with a 15s timeout, prints the status code, and fails the job (`::error::` + `exit 1`) on anything but 200 — so a broken deploy shows up as a failed Action run.

Validated with `actionlint` (installed via `brew install actionlint`) — schema-clean. The exact shell logic was also run against a real local backend (`localhost:8010/health`) and confirmed correct in all three paths: success (200), unset var (no-op), failure (404 → error + exit 1).

## Why this can't be fully "done" yet

The task's acceptance criterion is "pinger configured **and firing**; service **does not cold-start** on first judge request." Both halves require an actual deployed URL:
- "Firing" — the cron only runs against whatever `HEALTH_CHECK_URL` points to; there's nothing to point it at pre-deploy.
- "Does not cold-start" — this is a claim about Render's real spin-down behavior under a real pinger cadence; unfalsifiable without a real deploy.

**Do not mark this `[x]`** until both are actually true against a live deploy — marking it done now would be dishonest bookkeeping (this was explicitly checked and flagged during independent verification).

## What remains (for whoever deploys)

1. Deploy `backend/` to Render (or wherever) as `company-brain-api`.
2. Set the repo variable: GitHub repo → Settings → Secrets and variables → Actions → Variables tab → New repository variable → `HEALTH_CHECK_URL` = `https://<your-render-url>/health`.
3. Optionally trigger it once manually via the Actions tab (`workflow_dispatch`) to confirm it fires correctly before waiting for the first scheduled run.
4. Once confirmed firing on schedule for a while with no cold-start on a fresh judge-like request, flip tasks.md's OPS-2 to `[x]`.

No further local work is possible on this task — it's genuinely blocked on deployment, not on more code.
