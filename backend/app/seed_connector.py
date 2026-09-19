"""BE-7: SeedFileConnector — the "always works, always runs" connector from
v1 §2's system diagram. Implements SourceConnector (BE-4) over BE-6's corpus.
"""

from datetime import datetime
from typing import Iterable

from app.artifact import Artifact
from app.seed_corpus import SEED_ARTIFACTS


class SeedFileConnector:
    name: str = "seed"

    def fetch(self, since: datetime | None) -> Iterable[Artifact]:
        """`since=None` -> full pull (all of BE-6's corpus). Otherwise only
        artifacts with `updated_at > since`, matching the protocol contract."""
        if since is None:
            return list(SEED_ARTIFACTS)
        return [a for a in SEED_ARTIFACTS if a.updated_at > since]
