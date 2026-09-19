"""Cognee-powered PDF Q&A API using hosted Cognee service."""

import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
import httpx
from typing import Any

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Cognee PDF Q&A API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3010", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cognee configuration
COGNEE_API_KEY = os.getenv("COGNEE_API_KEY")
COGNEE_API_BASE_URL = os.getenv("COGNEE_API_BASE_URL")
COGNEE_TENANT_ID = os.getenv("COGNEE_TENANT_ID")
COGNEE_USER_ID = os.getenv("COGNEE_USER_ID")

if not all([COGNEE_API_KEY, COGNEE_API_BASE_URL, COGNEE_TENANT_ID, COGNEE_USER_ID]):
    raise ValueError("Missing Cognee credentials in .env file")

logger.info(f"Cognee configured: {COGNEE_API_BASE_URL}")


class PDFQuestionRequest(BaseModel):
    pdf_path: str
    question: str


async def upload_pdf_to_cognee(pdf_path: Path) -> dict:
    """Upload PDF to Cognee and process it."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        # Upload file
        with open(pdf_path, 'rb') as f:
            files = {'file': (pdf_path.name, f, 'application/pdf')}
            headers = {
                'Authorization': f'Bearer {COGNEE_API_KEY}',
                'X-Tenant-ID': COGNEE_TENANT_ID,
                'X-User-ID': COGNEE_USER_ID,
            }
            
            logger.info(f"Uploading PDF to Cognee: {pdf_path.name}")
            response = await client.post(
                f"{COGNEE_API_BASE_URL}/api/v1/add",
                files=files,
                headers=headers,
            )
            response.raise_for_status()
            upload_result = response.json()
            logger.info(f"Upload result: {upload_result}")
            
            # Cognify (process the document)
            logger.info("Processing document with Cognee...")
            cognify_response = await client.post(
                f"{COGNEE_API_BASE_URL}/api/v1/cognify",
                headers=headers,
                json={},
            )
            cognify_response.raise_for_status()
            cognify_result = cognify_response.json()
            logger.info(f"Cognify result: {cognify_result}")
            
            return {"upload": upload_result, "cognify": cognify_result}


async def search_cognee(query: str) -> list[dict]:
    """Search Cognee knowledge base."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        headers = {
            'Authorization': f'Bearer {COGNEE_API_KEY}',
            'X-Tenant-ID': COGNEE_TENANT_ID,
            'X-User-ID': COGNEE_USER_ID,
            'Content-Type': 'application/json',
        }
        
        logger.info(f"Searching Cognee for: {query}")
        response = await client.post(
            f"{COGNEE_API_BASE_URL}/api/v1/search",
            headers=headers,
            json={"query": query},
        )
        response.raise_for_status()
        results = response.json()
        logger.info(f"Search returned {len(results) if isinstance(results, list) else 'unknown'} results")
        return results


@app.get("/health")
async def health():
    return {"status": "ok", "cognee_configured": True}


@app.post("/pdf/upload")
async def upload_pdf(request: PDFQuestionRequest):
    """Upload and process a PDF with Cognee."""
    try:
        # Resolve PDF path
        pdf_path = request.pdf_path
        if not Path(pdf_path).is_absolute():
            backend_dir = Path(__file__).parent
            pdf_file = backend_dir / pdf_path
            if not pdf_file.exists():
                project_root = backend_dir.parent
                pdf_file = project_root / pdf_path
        else:
            pdf_file = Path(pdf_path)
        
        if not pdf_file.exists():
            raise HTTPException(status_code=404, detail=f"PDF not found: {request.pdf_path}")
        
        # Upload to Cognee
        result = await upload_pdf_to_cognee(pdf_file)
        
        return {
            "status": "success",
            "pdf_name": pdf_file.name,
            "message": "PDF uploaded and processed successfully",
            "result": result
        }
        
    except httpx.HTTPStatusError as e:
        logger.error(f"Cognee API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=502, detail=f"Cognee API error: {e.response.text}")
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pdf/ask")
async def ask_pdf(request: PDFQuestionRequest):
    """Ask a question about uploaded PDFs using Cognee."""
    try:
        # First, try to upload/process the PDF if provided
        pdf_path = request.pdf_path
        if pdf_path:
            if not Path(pdf_path).is_absolute():
                backend_dir = Path(__file__).parent
                pdf_file = backend_dir / pdf_path
                if not pdf_file.exists():
                    project_root = backend_dir.parent
                    pdf_file = project_root / pdf_path
            else:
                pdf_file = Path(pdf_path)
            
            if pdf_file.exists():
                try:
                    # Try to upload (will be idempotent if already uploaded)
                    await upload_pdf_to_cognee(pdf_file)
                except Exception as e:
                    logger.warning(f"Upload warning (may already exist): {e}")
        
        # Search for answer
        results = await search_cognee(request.question)
        
        # Format results
        if not results or (isinstance(results, dict) and not results.get('results')):
            return {
                "answer": "I couldn't find relevant information to answer your question. Make sure the PDF has been uploaded and processed.",
                "sources": [],
                "pdf_name": pdf_file.name if 'pdf_file' in locals() else None,
                "total_results": 0
            }
        
        # Extract answer and sources
        search_results = results if isinstance(results, list) else results.get('results', [])
        
        if not search_results:
            return {
                "answer": "No results found for your question.",
                "sources": [],
                "pdf_name": pdf_file.name if 'pdf_file' in locals() else None,
                "total_results": 0
            }
        
        # Build answer from top results
        answer_parts = []
        sources = []
        
        for i, result in enumerate(search_results[:3], 1):
            # Handle different result formats
            if isinstance(result, dict):
                text = result.get('text', result.get('content', str(result)))
                score = result.get('score', result.get('relevance', 0))
                answer_parts.append(f"[{i}] {text}")
                sources.append({
                    'text': text[:300] + "..." if len(text) > 300 else text,
                    'score': score
                })
            else:
                text = str(result)
                answer_parts.append(f"[{i}] {text}")
                sources.append({'text': text[:300], 'score': None})
        
        answer = "\n\n".join(answer_parts)
        
        return {
            "answer": answer,
            "sources": sources,
            "pdf_name": pdf_file.name if 'pdf_file' in locals() else None,
            "total_results": len(search_results),
            "powered_by": "Cognee"
        }
        
    except httpx.HTTPStatusError as e:
        logger.error(f"Cognee API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=502, detail=f"Cognee API error: {e.response.text}")
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pdf/reset")
async def reset_pdf():
    """Reset endpoint."""
    return {"status": "success", "message": "Ready for new queries"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
