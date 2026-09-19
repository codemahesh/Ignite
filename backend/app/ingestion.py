"""BE-8: ingestion runner.

For each artifact from a `SourceConnector`: stage to Postgres `artifacts`
first (crash-safe replay — a row with `cognee_doc_id IS NULL` means "staged
but not yet successfully added to cognee," safe to retry), then hand it to
cognee via BE-5's ID-carrying file path + node_set tags, then one
`cognee.cognify(datasets=[DATASET_NAME])` for the whole batch.

**Deviation from the architecture doc's literal "delete-before-re-add"**:
cognee 1.6.0 refuses `cognee.add()` on a file whose stored path already
exists with different content (`DocumentUpdateRequiredError`) — its own
error message and `refuse_changed_existing_documents.py` docstring say this
is deliberate: "updates go through update() so the document keeps its id and
its graph is replaced in place instead of a second copy being minted." A
plain delete via `cognee.datasets.delete_data()` (soft mode; "hard" is
explicitly discouraged by cognee itself) does not clear the row that check
matches on, so add()-after-delete still gets refused. `cognee.update(data_id,
data, dataset_id, node_set=...)` achieves the exact outcome the architecture
doc wants — no stale version left in the graph to self-contradict — via the
API cognee 1.6.0 actually provides for it. See memory/BE-8.md.

Keyless by design: with `LLM_API_KEY` unset, cognee extracts with the local
GLiNER demo model and embeds with local fastembed — no network LLM call, no
cost. See memory/00-project-context.md and memory/BE-8.md.
"""

import hashlib
import logging
from pathlib import Path
from uuid import UUID

import cognee

from app.artifact import Artifact, SourceConnector
from app.artifact_resolver import node_set_for, write_artifact_file
from app.db import SessionLocal
from app.models import Artifact as ArtifactRow

logger = logging.getLogger(__name__)

DATASET_NAME = "company_brain"
STAGING_DIR = Path(__file__).resolve().parent.parent / ".data_storage" / "artifacts"


def content_hash_for(artifact: Artifact) -> str:
    """Hash over the fields that matter for "did this artifact actually
    change" — title + body. Metadata-only edits (e.g. topic reassignment)
    deliberately do NOT trigger a re-add; extend this if that's ever wrong."""
    payload = f"{artifact.title}\n{artifact.body}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def _get_dataset_id(name: str) -> UUID | None:
    """cognee.update() needs a dataset UUID, not a name. Looked up fresh each
    run rather than cached — this project uses exactly one dataset (v2 §2.1
    decision #10), so this is one cheap call, not a per-artifact cost."""
    datasets = await cognee.datasets.list_datasets()
    for dataset in datasets:
        if getattr(dataset, "name", None) == name:
            return dataset.id
    return None


async def ingest_artifacts(connector: SourceConnector, since=None) -> dict[str, int]:
    """Fetch from `connector`, stage to Postgres, add+cognify via cognee.

    Returns counts: {fetched, added, updated, unchanged, retried}.
    """
    artifacts = list(connector.fetch(since))
    counts = {"fetched": len(artifacts), "added": 0, "updated": 0, "unchanged": 0, "retried": 0}

    to_add: list[tuple[Artifact, Path, list[str]]] = []
    to_update: list[tuple[Artifact, Path, list[str], UUID]] = []
    any_work = False

    session = SessionLocal()
    try:
        for artifact in artifacts:
            new_hash = content_hash_for(artifact)
            existing = session.get(ArtifactRow, artifact.id)
            hash_changed = existing is not None and existing.content_hash != new_hash

            # Classify once, up front -- avoids double-counting across branches.
            if existing is None:
                state = "added"
            elif not hash_changed:
                state = "unchanged" if existing.cognee_doc_id else "retried"
            else:
                state = "updated"
            counts[state] += 1

            if state == "unchanged":
                continue  # already ingested successfully, nothing to do

            path = write_artifact_file(artifact, STAGING_DIR)
            tags = node_set_for(artifact)

            if state == "updated" and existing.cognee_doc_id:
                # content changed and cognee already has a version -- update()
                # in place (keeps the doc id, replaces its graph). See module
                # docstring for why this replaces the doc's original
                # delete-then-re-add design.
                to_update.append((artifact, path, tags, UUID(existing.cognee_doc_id)))
            else:
                # "added", "retried" (staged but never finished), or "updated"
                # with no prior cognee_doc_id (changed before it ever finished
                # adding) -- all go through add(), never seen by cognee before.
                to_add.append((artifact, path, tags))

            row = existing or ArtifactRow(id=artifact.id)
            row.content_hash = new_hash
            row.cognee_doc_id = row.cognee_doc_id if existing else None  # kept until update()/add() confirms
            row.source = artifact.source
            row.type = artifact.type
            row.topic = artifact.topic
            row.title = artifact.title
            row.author = artifact.author
            row.url = artifact.url
            row.created_at = artifact.created_at
            row.updated_at = artifact.updated_at
            session.add(row)

        session.commit()  # stage BEFORE calling cognee -- a crash here loses nothing

        for artifact, path, tags in to_add:
            result = await cognee.add(str(path), dataset_name=DATASET_NAME, node_set=tags)
            data_id = result.data_ingestion_info[0]["data_id"]
            row = session.get(ArtifactRow, artifact.id)
            row.cognee_doc_id = str(data_id)
            session.commit()  # per-artifact commit -- a crash mid-batch loses only the unfinished one
            any_work = True

        if to_update:
            dataset_id = await _get_dataset_id(DATASET_NAME)
            for artifact, path, tags, data_id in to_update:
                await cognee.update(
                    data_id=data_id, data=str(path), dataset_id=dataset_id, node_set=tags
                )
                row = session.get(ArtifactRow, artifact.id)
                row.cognee_doc_id = str(data_id)  # unchanged -- update() keeps the id
                session.commit()
                any_work = True

        if any_work:
            await cognee.cognify(datasets=[DATASET_NAME])
    finally:
        session.close()

    return counts
