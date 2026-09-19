# BE-5 — Artifact-ID resolution

**Status: done. Verified by independent subagent, including alternate-key spot checks.**

## What was built

`backend/app/artifact_resolver.py` — the 3-redundant-path fix from `PS-2_Architecture_Review.md` §1.1:

- `safe_filename_id(id)` / `_unsafe_filename_id(safe_id)` — `"jira:PLAT-412"` ↔ `"jira__PLAT-412"`. **Assumes artifact IDs never naturally contain `"__"`** (true for the `source:key` convention used everywhere in this project) — if that convention ever changes, this breaks silently. Worth a comment, already has one.
- `render_artifact_markdown(artifact)` — `<!-- artifact_id: {id} | source: {source} | date: {date} -->` header + `# {title}` + body.
- `write_artifact_file(artifact, directory)` — writes `<safe_id>.md`, returns the `Path`. **Pass this path to `cognee.add()` in BE-8**, not the raw artifact object.
- `node_set_for(artifact)` — `["artifact:{id}", "source:{source}"]`, plus `"topic:{topic}"` **only if topic is truthy** (avoids a garbage `"topic:None"` tag pre-BE-29). **Pass this to `cognee.add(..., node_set=...)` in BE-8.**
- `resolve_artifact_id(result: dict) -> tuple[str | None, str]` — the actual resolver. Tries, in order: (1) file_path/document_name/title/name → split on `"__"`, (2) regex `artifact_id:\s*([^\s|]+)` against `text` or `body`, (3) scan `node_set` or `tags` for an `"artifact:"`-prefixed entry. Returns `(artifact_id, route_name)` where route_name is `"file_path" | "header" | "node_set" | "none"`, and logs (`logger.info`/`logger.warning`) which one fired — confirmed actually firing, not just claimed in a comment.

Tests: `backend/tests/test_artifact_resolver.py` (8 tests, one per route + alternate-key coverage confirmed independently + a no-match case + a real write→resolve round-trip). Run with `python -m pytest tests/test_artifact_resolver.py -v` from `backend/` with the venv active.

## Deliberate scoping (not a shortcut)

`resolve_artifact_id` is tested against **loosely-shaped dicts**, not a real `cognee.search(..., include_references=True)` call — because that call's actual result shape isn't validated until **BE-10**, which hasn't run yet. This is correct sequencing per the docs' own "Open Risks" section ("`include_references` is load-bearing... validate before building either"). **When BE-10 lands, feed a real Cognee reference through this exact function** and confirm one of the three routes still fires — if Cognee's real shape uses field names this function doesn't check (its current key list: `file_path`/`document_name`/`title`/`name` for route 1, `text`/`body` for route 2, `node_set`/`tags` for route 3), extend the key list rather than rewriting the function.

## For downstream tasks

- **BE-8** (ingestion runner) is the first real caller: for each artifact, call `write_artifact_file()` to get a path, `node_set_for()` for tags, embed nothing extra — the header is already inside the file `write_artifact_file` wrote.
- **BE-10** (verify `include_references`) is the real integration test for this resolver — see note above.
- **BE-12** (Postgres metadata lookup) is a *different* resolution step (artifact ID → row in `artifacts` table for dates/source/etc.) — don't confuse it with this file's job, which is purely "Cognee reference → artifact ID string." BE-12 takes this function's output as its input.
