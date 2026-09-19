from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

settings = get_settings()

app = FastAPI(title="Company Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    """Process-alive check only. Never touches a dependency (Postgres/Neo4j/cognee) —
    that's /ready (BE-3). Used by the keep-warm pinger (OPS-2)."""
    return {"status": "ok"}
