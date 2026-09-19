"""BE-2: Postgres schema (v1 watermarks/jobs + v2 §2.1/§3.2/§3.3 connectors/artifacts/dead_letters).

Table shapes follow the architecture docs' literal SQL where given (artifacts,
connectors, dead_letters). `jobs`/`sync_jobs` and `watermarks` aren't given as
literal SQL in the docs, only as field lists — see the docstring on each model
below for the exact source and any judgment calls made filling gaps.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Index,
    LargeBinary,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Connector(Base):
    """v2 §2.1 REGISTRY table — literal SQL from the architecture doc, unchanged
    except `created_at` gets a server_default so raw inserts don't need to set it.
    """

    __tablename__ = "connectors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    spec_key: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str] = mapped_column(Text, nullable=False, default="AVAILABLE")
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    credentials: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    watermark: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    breaker_open_until: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default="now()"
    )

    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="connector")
    jobs: Mapped[list["SyncJob"]] = relationship(back_populates="connector")


class Artifact(Base):
    """v2 §3.2 idempotency table — literal SQL from the architecture doc.
    `connector_id` is nullable: seed-corpus artifacts (BE-7/BE-8, Phase 2) are
    ingested before the connector registry exists (BE-22, Phase 4), so they
    won't have one until/unless a seed catalog entry is registered later.
    """

    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # e.g. "jira:PLAT-412"
    connector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connectors.id", ondelete="CASCADE"), nullable=True
    )
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    cognee_doc_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    topic: Mapped[str | None] = mapped_column(Text, nullable=True)  # filled by BE-29
    title: Mapped[str] = mapped_column(Text, nullable=False)
    author: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default="now()"
    )

    connector: Mapped[Connector | None] = relationship(back_populates="artifacts")

    __table_args__ = (Index("ix_artifacts_source_topic", "source", "topic"),)


class Watermark(Base):
    """v1 §3 "Incremental sync": `watermarks(source TEXT PRIMARY KEY, last_synced_at TIMESTAMPTZ)`.
    Field list only in the doc, given verbatim here.
    """

    __tablename__ = "watermarks"

    source: Mapped[str] = mapped_column(Text, primary_key=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class SyncJob(Base):
    """`jobs`/`sync_jobs` — no literal SQL in the docs, only field requirements
    assembled from two places: v1 §5 API surface (`GET /sync/{job_id}` ->
    `{status: queued|running|done|failed, per_source: [...]}`) and v2 §3.4/§6
    (`GET /jobs/{job_id}` -> progress: fetched/ingested/failed/state, persisted
    so a restart doesn't lose visibility - BE-26). `connector_id` nullable =
    the aggregate seed/full sync job (v1) has no single connector; a per-connector
    job (v2 BE-26) sets it. The FK isn't given explicitly in the docs but is a
    reasonable addition (ON DELETE CASCADE, matching the `artifacts` pattern).
    """

    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connectors.id", ondelete="CASCADE"), nullable=True
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default="queued")  # queued|running|done|failed
    fetched: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    ingested: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    per_source: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # v1 SourceStatus[] for aggregate jobs
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default="now()"
    )
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    connector: Mapped[Connector | None] = relationship(back_populates="jobs")


class DeadLetter(Base):
    """v2 §3.3 — literal SQL from the architecture doc, unchanged. Note the doc
    gives `connector_id UUID` with NO foreign-key constraint (unlike artifacts/
    jobs) — kept exactly as documented so dead-letter records survive a
    connector's removal for audit purposes, rather than cascading away.
    """

    __tablename__ = "dead_letters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connector_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    artifact_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[str | None] = mapped_column(Text, nullable=True)  # fetch | normalize | cognify
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default="now()"
    )
