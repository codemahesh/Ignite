# BE-4 — Artifact dataclass + SourceConnector protocol

**Status: done. Verified by independent subagent (positive + negative mypy tests).**

## What was built

`backend/app/artifact.py` — copied verbatim from architecture doc v1 §3 ("Canonical envelope" / "Connector contract"), no deviations:

```python
@dataclass
class Artifact:
    id: str; source: str; type: str; title: str; body: str
    author: str | None
    created_at: datetime; updated_at: datetime
    url: str | None; topic: str | None

class SourceConnector(Protocol):
    name: str
    def fetch(self, since: datetime | None) -> Iterable[Artifact]: ...
```

- **`SourceConnector` is a plain `Protocol`, deliberately NOT `@runtime_checkable`.** The doc's literal code doesn't have that decorator. This means `isinstance(x, SourceConnector)` will raise `TypeError` — that's expected, not a bug. Structural conformance is checked **statically by mypy**, not at runtime. Don't add `@runtime_checkable` later without a real reason (Protocol conformance checks belong at type-check time / CI, not scattered `isinstance` calls in application code).
- `from __future__ import annotations` is at the top — needed so `str | None` union syntax works even if this ever needs to run somewhere with an older typing setup; harmless on 3.11.

## Verified

- Imports and instantiates cleanly.
- **mypy positive test**: a duck-typed class (no inheritance from `SourceConnector`) with matching `name`/`fetch` shape is accepted where `SourceConnector` is required.
- **mypy negative test**: a class with a wrong `fetch` return type (`Iterable[str]` instead of `Iterable[Artifact]`) AND a missing `name` attribute is correctly **rejected** by mypy with both violations named. This proves the Protocol is actually doing structural enforcement, not silently passing everything.
- `mypy` was added to `backend/requirements.txt` (dev dependency, no version pin) since it's now load-bearing for verifying every future `SourceConnector` implementation (BE-7 SeedFileConnector, BE-21 MCPConnector, BE-24 fixture connector all need to structurally satisfy this Protocol — run mypy against them, don't just eyeball it).

## For downstream tasks

- **BE-5** (artifact-ID resolution) and **BE-6** (seed corpus) both depend only on this file — go next per file order.
- **BE-7** (`SeedFileConnector`) must implement `fetch(self, since: datetime | None) -> Iterable[Artifact]` and set a `name: str` class/instance attribute to structurally satisfy this Protocol — verify with `mypy`, following the same pattern as this task's negative test.
- The doc's `fetch()` signature is **synchronous**. BE-21's `MCPConnector` will need real network I/O (MCP calls) — decide then whether to keep it sync (and let the caller run it in a thread) or diverge from the doc's literal signature; that's BE-21's call to make and document, not something to pre-empt here.
