"""BE-8 integration tests. Requires the real local Postgres + Neo4j + cognee
stack (see memory/OPS-1.md) — these are NOT mocked, by design: the point of
this task is that the pipeline actually works end to end with the keyless
GLiNER path. Run with the venv active and .env loaded, same as any other
test in this suite.

All cognee-touching scenarios run inside ONE test function
(`test_ingestion_lifecycle`), not split across separate `async def test_*`
functions. Cognee caches its relational engine/connection pool at module
level (`@lru_cache`-wrapped, see memory/OPS-1.md); pytest-asyncio gives each
`async def test_*` its own event loop by default, and asyncpg connections
created in one loop break ("attached to a different loop") when reused from
another. Session-scoped event loop config (`asyncio_default_fixture_loop_scope`
etc. in pytest.ini) did not reliably fix this across pytest-asyncio's
fixture/test loop scoping. One test function = one event loop for its whole
body, which sidesteps the issue entirely rather than fighting it.

NEVER use `cognee.prune.prune_system(metadata=True)` for cleanup — it drops
our own Postgres tables too (see memory/OPS-1.md's warning box). This suite
uses `cognee.datasets.delete_all()` instead, which only clears cognee's own
datasets.
"""

import os
from datetime import datetime, timezone

import cognee
import pytest

from app.artifact import Artifact
from app.db import SessionLocal
from app.ingestion import content_hash_for, ingest_artifacts
from app.models import Artifact as ArtifactRow

TEST_ARTIFACT = Artifact(
    id="test:be8-fixture",
    source="test",
    type="policy",
    title="BE-8 Test Fixture",
    body="This is a test artifact for BE-8 ingestion pipeline tests.",
    author="test-suite",
    created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    updated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    url=None,
    topic="test",
)


class SingleArtifactConnector:
    """Mirrors real connector behavior (BE-7's SeedFileConnector): `since=None`
    means full pull, otherwise filter by `updated_at > since`."""

    name = "test"

    def __init__(self, artifact: Artifact):
        self.artifact = artifact

    def fetch(self, since):
        if since is None or self.artifact.updated_at > since:
            return [self.artifact]
        return []


def _cleanup_row(artifact_id: str) -> None:
    session = SessionLocal()
    try:
        row = session.get(ArtifactRow, artifact_id)
        if row is not None:
            session.delete(row)
            session.commit()
    finally:
        session.close()


def test_content_hash_changes_with_body():
    a = TEST_ARTIFACT
    b = Artifact(**{**a.__dict__, "body": a.body + " different"})
    assert content_hash_for(a) != content_hash_for(b)


def test_content_hash_stable_for_identical_content():
    a = TEST_ARTIFACT
    b = Artifact(**a.__dict__)
    assert content_hash_for(a) == content_hash_for(b)


@pytest.mark.asyncio
async def test_ingestion_lifecycle():
    """First add -> idempotent re-run -> content change (update in place) ->
    `since` filtering. Sequential sub-scenarios sharing one event loop —
    see module docstring for why this isn't 4 separate test functions."""
    os.environ.pop("LLM_API_KEY", None)  # keyless GLiNER path
    _cleanup_row(TEST_ARTIFACT.id)
    await cognee.datasets.delete_all()

    try:
        connector = SingleArtifactConnector(TEST_ARTIFACT)

        # --- first ingest: adds ---
        counts = await ingest_artifacts(connector, since=None)
        assert counts == {"fetched": 1, "added": 1, "updated": 0, "unchanged": 0, "retried": 0}

        session = SessionLocal()
        try:
            row = session.get(ArtifactRow, TEST_ARTIFACT.id)
            assert row is not None
            assert row.cognee_doc_id is not None
            assert row.content_hash == content_hash_for(TEST_ARTIFACT)
            assert row.title == TEST_ARTIFACT.title
            first_doc_id = row.cognee_doc_id
        finally:
            session.close()

        # --- second ingest, unchanged content: no-op ---
        counts = await ingest_artifacts(connector, since=None)
        assert counts == {"fetched": 1, "added": 0, "updated": 0, "unchanged": 1, "retried": 0}

        session = SessionLocal()
        try:
            assert session.get(ArtifactRow, TEST_ARTIFACT.id).cognee_doc_id == first_doc_id
        finally:
            session.close()

        # --- content changed: update in place, same doc id, new hash ---
        changed = Artifact(**{**TEST_ARTIFACT.__dict__, "body": "Completely different content now."})
        counts = await ingest_artifacts(SingleArtifactConnector(changed), since=None)
        assert counts == {"fetched": 1, "added": 0, "updated": 1, "unchanged": 0, "retried": 0}

        session = SessionLocal()
        try:
            row = session.get(ArtifactRow, TEST_ARTIFACT.id)
            assert row.cognee_doc_id == first_doc_id  # update() keeps the id, doesn't mint a new one
            assert row.content_hash == content_hash_for(changed)
        finally:
            session.close()

        # --- `since` filtering: an artifact updated before the cutoff is never fetched ---
        _cleanup_row(TEST_ARTIFACT.id)
        old_artifact = Artifact(
            **{**TEST_ARTIFACT.__dict__, "updated_at": datetime(2020, 1, 1, tzinfo=timezone.utc)}
        )
        counts = await ingest_artifacts(
            SingleArtifactConnector(old_artifact), since=datetime(2024, 1, 1, tzinfo=timezone.utc)
        )
        assert counts["fetched"] == 0

        session = SessionLocal()
        try:
            assert session.get(ArtifactRow, TEST_ARTIFACT.id) is None
        finally:
            session.close()
    finally:
        _cleanup_row(TEST_ARTIFACT.id)
        await cognee.datasets.delete_all()
