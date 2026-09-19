from datetime import datetime, timezone
from pathlib import Path

from app.artifact import Artifact
from app.artifact_resolver import (
    node_set_for,
    render_artifact_markdown,
    resolve_artifact_id,
    safe_filename_id,
    write_artifact_file,
)

SAMPLE = Artifact(
    id="jira:PLAT-412",
    source="jira",
    type="ticket",
    title="Deploy failure on platform service",
    body="Something broke.",
    author="Alice",
    created_at=datetime(2025, 6, 12, tzinfo=timezone.utc),
    updated_at=datetime(2025, 6, 14, tzinfo=timezone.utc),
    url="https://example.atlassian.net/browse/PLAT-412",
    topic="incident",
)


def test_safe_filename_id_roundtrip():
    safe = safe_filename_id(SAMPLE.id)
    assert safe == "jira__PLAT-412"


def test_route_1_file_path():
    result = {"file_path": "/tmp/whatever/jira__PLAT-412.md"}
    artifact_id, route = resolve_artifact_id(result)
    assert artifact_id == "jira:PLAT-412"
    assert route == "file_path"


def test_route_1_document_name_without_extension():
    result = {"document_name": "jira__PLAT-412"}
    artifact_id, route = resolve_artifact_id(result)
    assert artifact_id == "jira:PLAT-412"
    assert route == "file_path"


def test_route_2_header_in_text():
    body = render_artifact_markdown(SAMPLE)
    # Simulate a Cognee chunk that only returns raw text, no filename/tags.
    result = {"text": body[:200]}
    artifact_id, route = resolve_artifact_id(result)
    assert artifact_id == "jira:PLAT-412"
    assert route == "header"


def test_route_3_node_set():
    result = {"node_set": node_set_for(SAMPLE)}
    artifact_id, route = resolve_artifact_id(result)
    assert artifact_id == "jira:PLAT-412"
    assert route == "node_set"


def test_no_route_matches_returns_none():
    result = {"text": "no header here", "title": "Deploy failure"}
    artifact_id, route = resolve_artifact_id(result)
    assert artifact_id is None
    assert route == "none"


def test_write_artifact_file_round_trips_through_resolver(tmp_path: Path):
    path = write_artifact_file(SAMPLE, tmp_path)
    assert path.name == "jira__PLAT-412.md"

    content = path.read_text()
    assert content.startswith("<!-- artifact_id: jira:PLAT-412 | source: jira | date: 2025-06-14 -->")

    # Prove the file this function wrote is itself resolvable both by its
    # path (route 1) and by its embedded header (route 2).
    artifact_id, route = resolve_artifact_id({"file_path": str(path)})
    assert (artifact_id, route) == ("jira:PLAT-412", "file_path")

    artifact_id, route = resolve_artifact_id({"text": content})
    assert (artifact_id, route) == ("jira:PLAT-412", "header")


def test_node_set_for_omits_topic_when_none():
    untagged = Artifact(**{**SAMPLE.__dict__, "topic": None})
    tags = node_set_for(untagged)
    assert tags == ["artifact:jira:PLAT-412", "source:jira"]
