"""Run BE-6's seed corpus through the BE-8 ingestion pipeline.

Also doubles as the tool for BE-9's manual Neo4j inspection gate — run this,
then inspect the graph.

    cd backend && source .venv/bin/activate
    set -a && source .env && set +a
    python3 scripts/ingest_seed_corpus.py
"""

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")
os.environ.pop("LLM_API_KEY", None)  # keyless GLiNER path -- see memory/00-project-context.md

from app.ingestion import ingest_artifacts  # noqa: E402
from app.seed_connector import SeedFileConnector  # noqa: E402


async def main() -> None:
    connector = SeedFileConnector()
    counts = await ingest_artifacts(connector, since=None)
    print(f"Ingestion complete: {counts}")


if __name__ == "__main__":
    asyncio.run(main())
