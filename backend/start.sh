#!/usr/bin/env bash
# Canonical start command — local dev AND deploy (Render) use this unchanged.
# --workers 1 is load-bearing: the job registry, sync-job tracking, and the
# answer cache are in-process state (v1 §3, "Multiple uvicorn workers will
# fragment your in-process state"). Do not raise this without also moving
# that state out of process memory.
set -euo pipefail
cd "$(dirname "$0")"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
