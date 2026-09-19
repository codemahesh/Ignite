"""BE-5: artifact-ID resolution, per PS-2_Architecture_Review.md §1.1
("There is no link from a Cognee reference back to your artifact ID").

Cognee mints its own document/chunk UUIDs; nothing connects a returned
reference to our `artifact.id` unless we deliberately put it there. Three
redundant paths, tried in order — whichever survives Cognee's internals, we
have a mapping:

1. File path / document name — write artifacts to disk as `<safe_id>.md`
   before `cognee.add()`; Cognee tracks document name/title, so the ID rides
   along in provenance.
2. Header comment embedded in the body text itself — survives chunking.
3. `node_set` tags attached at ingest (`artifact:{id}`, `source:{...}`,
   `topic:{...}`).

`resolve_artifact_id` tries all three against whatever shape a Cognee search
result/reference happens to expose and logs which route fired — this is the
"resolver as one function with three fallbacks" the review calls for.
"""

import logging
import re
from pathlib import Path
from typing import Any

from app.artifact import Artifact

logger = logging.getLogger(__name__)

ARTIFACT_ID_HEADER_RE = re.compile(r"artifact_id:\s*([^\s|]+)")


def safe_filename_id(artifact_id: str) -> str:
    """"jira:PLAT-412" -> "jira__PLAT-412". Assumes artifact IDs don't
    naturally contain "__" (true for the "source:key" convention used
    throughout this project) — see `_unsafe_filename_id` for the inverse."""
    return artifact_id.replace(":", "__")


def _unsafe_filename_id(safe_id: str) -> str:
    return safe_id.replace("__", ":", 1)


def render_artifact_markdown(artifact: Artifact) -> str:
    header = (
        f"<!-- artifact_id: {artifact.id} | source: {artifact.source} | "
        f"date: {artifact.updated_at.date().isoformat()} -->\n"
    )
    return f"{header}# {artifact.title}\n\n{artifact.body}\n"


def write_artifact_file(artifact: Artifact, directory: Path) -> Path:
    """Route 1's write side — pass the returned path to `cognee.add()`."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{safe_filename_id(artifact.id)}.md"
    path.write_text(render_artifact_markdown(artifact))
    return path


def node_set_for(artifact: Artifact) -> list[str]:
    """Route 3's write side — pass to `cognee.add(..., node_set=...)`."""
    tags = [f"artifact:{artifact.id}", f"source:{artifact.source}"]
    if artifact.topic:
        tags.append(f"topic:{artifact.topic}")
    return tags


def resolve_artifact_id(result: dict[str, Any]) -> tuple[str | None, str]:
    """Resolve a Cognee search result/reference back to our artifact.id.

    `result` is treated loosely (plain dict, not a specific Cognee type) since
    the exact shape `cognee.search(..., include_references=True)` returns is
    validated separately in BE-10 — this function only needs to work against
    whatever shape shows up, trying each route until one fires.

    Returns (artifact_id, route_name). route_name is one of
    "file_path" | "header" | "node_set" | "none" — logged either way so a
    resolution failure or an unexpected route is visible, not silent.
    """

    # Route 1: file path / document name carries the safe id.
    for key in ("file_path", "document_name", "title", "name"):
        value = result.get(key)
        if value:
            stem = Path(str(value)).stem
            if "__" in stem:
                artifact_id = _unsafe_filename_id(stem)
                logger.info("artifact id resolved via file_path route: %s", artifact_id)
                return artifact_id, "file_path"

    # Route 2: header comment embedded in chunk text.
    text = result.get("text") or result.get("body") or ""
    match = ARTIFACT_ID_HEADER_RE.search(text)
    if match:
        artifact_id = match.group(1)
        logger.info("artifact id resolved via header route: %s", artifact_id)
        return artifact_id, "header"

    # Route 3: node_set / tags attached at ingest.
    tags = result.get("node_set") or result.get("tags") or []
    for tag in tags:
        if isinstance(tag, str) and tag.startswith("artifact:"):
            artifact_id = tag[len("artifact:") :]
            logger.info("artifact id resolved via node_set route: %s", artifact_id)
            return artifact_id, "node_set"

    logger.warning("artifact id could not be resolved from cognee result: %r", result)
    return None, "none"
