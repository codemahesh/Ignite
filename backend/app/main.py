import asyncio

from fastapi import FastAPI, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_settings
from app.readiness import check_cognee_config, check_neo4j, check_postgres
from app.pdf_qa import process_pdf_and_ask, reset_pdf_dataset

settings = get_settings()

app = FastAPI(title="Company Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PDFQuestionRequest(BaseModel):
    pdf_path: str
    question: str


@app.get("/health")
async def health() -> dict:
    """Process-alive check only. Never touches a dependency (Postgres/Neo4j/cognee) —
    that's /ready (BE-3). Used by the keep-warm pinger (OPS-2)."""
    return {"status": "ok"}


@app.get("/ready")
async def ready(response: Response) -> dict:
    """Checks Neo4j + Postgres + cognee config, unlike /health. Manual pre-demo
    check — NOT wired to the keep-warm pinger (that would defeat /health's
    purpose of never touching a dependency)."""
    (pg_ok, pg_err), (neo4j_ok, neo4j_err), (cognee_ok, cognee_err) = await asyncio.gather(
        asyncio.to_thread(check_postgres),
        asyncio.to_thread(check_neo4j),
        asyncio.to_thread(check_cognee_config),
    )
    all_ok = pg_ok and neo4j_ok and cognee_ok
    response.status_code = 200 if all_ok else 503
    return {
        "status": "ready" if all_ok else "not_ready",
        "postgres": {"ok": pg_ok, "error": pg_err},
        "neo4j": {"ok": neo4j_ok, "error": neo4j_err},
        "cognee_config": {"ok": cognee_ok, "error": cognee_err},
    }


@app.post("/pdf/ask")
async def ask_pdf(request: PDFQuestionRequest) -> dict:
    """Ask a question about a PDF document.
    
    This endpoint processes a PDF and answers natural language questions about it.
    Perfect for demo purposes!
    """
    try:
        # Try simple version first (faster, no ML setup needed)
        from app.simple_pdf_qa import simple_pdf_qa
        result = simple_pdf_qa(request.pdf_path, request.question)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


@app.post("/pdf/reset")
async def reset_pdf() -> dict:
    """Reset the PDF dataset (useful for demos to start fresh)."""
    try:
        await reset_pdf_dataset()
        return {"status": "success", "message": "PDF dataset reset"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resetting: {str(e)}")
