"""BE-3: dependency checks for GET /ready. Kept separate from /health, which
must never import this module (see app/main.py's /health docstring)."""

import os

from sqlalchemy import text

from app.db import engine

# Env vars cognee actually reads for its DB/graph config (see memory/OPS-1.md
# for how this was confirmed against the installed cognee 1.6.0 source, not
# assumed from the architecture docs). "Cognee configured" = these are set,
# not a live cognee call — a live call would just re-test Postgres/Neo4j
# reachability a second time under a slower, heavier path.
REQUIRED_COGNEE_VARS = [
    "DB_PROVIDER",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USERNAME",
    "DB_PASSWORD",
    "VECTOR_DB_PROVIDER",
    "VECTOR_DB_HOST",
    "VECTOR_DB_PORT",
    "VECTOR_DB_NAME",
    "VECTOR_DB_USERNAME",
    "VECTOR_DB_PASSWORD",
    "GRAPH_DATABASE_PROVIDER",
    "GRAPH_DATABASE_URL",
    "GRAPH_DATABASE_USERNAME",
    "GRAPH_DATABASE_PASSWORD",
]


def check_postgres() -> tuple[bool, str | None]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as e:  # noqa: BLE001 — surfaced to the caller, not swallowed
        return False, str(e)


def check_neo4j() -> tuple[bool, str | None]:
    try:
        from neo4j import GraphDatabase

        driver = GraphDatabase.driver(
            os.environ["GRAPH_DATABASE_URL"],
            auth=(os.environ["GRAPH_DATABASE_USERNAME"], os.environ["GRAPH_DATABASE_PASSWORD"]),
        )
        try:
            with driver.session() as session:
                result = session.run("RETURN 1 AS ok")
                if result.single()["ok"] != 1:
                    return False, "unexpected response"
            return True, None
        finally:
            driver.close()
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def check_cognee_config() -> tuple[bool, str | None]:
    missing = [v for v in REQUIRED_COGNEE_VARS if not os.getenv(v)]
    if missing:
        return False, f"missing env vars: {missing}"
    return True, None
