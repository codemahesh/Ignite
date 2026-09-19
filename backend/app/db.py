import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Load .env from backend directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)


class Base(DeclarativeBase):
    pass


def _database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    # Fallback: assemble from the same DB_* vars cognee reads (see memory/OPS-1.md).
    host = os.environ["DB_HOST"]
    port = os.environ["DB_PORT"]
    name = os.environ["DB_NAME"]
    user = os.environ["DB_USERNAME"]
    password = os.environ["DB_PASSWORD"]
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


engine = create_engine(_database_url())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
