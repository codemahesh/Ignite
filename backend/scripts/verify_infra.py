"""OPS-1 infra verification.

Confirms cognee 1.6.0 can reach the local Postgres+pgvector and Neo4j
instances (docker-compose Postgres, Homebrew-installed Neo4j — see
memory/OPS-1.md for why Neo4j runs outside Docker on this machine) and that
prune.prune_data() + prune.prune_system(metadata=True) run cleanly.

Run with the backend venv active:
    source backend/.venv/bin/activate && python backend/scripts/verify_infra.py
"""

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

import psycopg2
from neo4j import GraphDatabase


def check_postgres() -> None:
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USERNAME"],
        password=os.environ["DB_PASSWORD"],
    )
    with conn.cursor() as cur:
        cur.execute("SELECT 1")
        assert cur.fetchone() == (1,)
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.commit()
    conn.close()
    print("[OK] Postgres reachable, pgvector extension available")


def check_neo4j() -> None:
    driver = GraphDatabase.driver(
        os.environ["GRAPH_DATABASE_URL"],
        auth=(os.environ["GRAPH_DATABASE_USERNAME"], os.environ["GRAPH_DATABASE_PASSWORD"]),
    )
    with driver.session() as session:
        result = session.run("RETURN 1 AS ok")
        assert result.single()["ok"] == 1
    driver.close()
    print("[OK] Neo4j reachable")


async def check_cognee_prune() -> None:
    import cognee

    cognee.config.data_root_directory(str(BACKEND_DIR / ".data_storage"))
    await cognee.prune.prune_data()
    await cognee.prune.prune_system(metadata=True)
    print("[OK] cognee.prune.prune_data() + prune_system(metadata=True) ran cleanly")


def main() -> None:
    required = [
        "DB_HOST", "DB_PORT", "DB_NAME", "DB_USERNAME", "DB_PASSWORD",
        "GRAPH_DATABASE_URL", "GRAPH_DATABASE_USERNAME", "GRAPH_DATABASE_PASSWORD",
        "VECTOR_DB_PROVIDER", "DB_PROVIDER",
    ]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        print(f"[FAIL] Missing required env vars: {missing}")
        sys.exit(1)

    check_postgres()
    check_neo4j()
    asyncio.run(check_cognee_prune())
    print("\nOPS-1 verification passed.")


if __name__ == "__main__":
    main()
