"""BE-4: canonical envelope + connector protocol, verbatim from
PS-2_Company_Brain_Architecture (1).md §3 ("Canonical envelope" / "Connector
contract"). Every connector (seed, MCP, fixture) emits this identical shape —
cognee never sees a source-specific format.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Protocol


@dataclass
class Artifact:
    id: str  # stable, source-prefixed: "jira:PLAT-412"
    source: str  # confluence | jira | sharepoint | slack | seed
    type: str  # policy | decision | ticket | message | meeting_note
    title: str
    body: str  # plain text
    author: str | None
    created_at: datetime
    updated_at: datetime  # drives contradiction resolution
    url: str | None
    topic: str | None  # coarse tag, used for conflict grouping


class SourceConnector(Protocol):
    name: str

    def fetch(self, since: datetime | None) -> Iterable[Artifact]:
        """`since=None` means full pull. Otherwise pull only items with
        `updated_at > since`."""
        ...
