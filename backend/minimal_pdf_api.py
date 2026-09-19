"""Minimal standalone PDF Q&A API for quick demo - no database needed."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
from pathlib import Path
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="COMPANY BRAIN API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3010", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PDFQuestionRequest(BaseModel):
    pdf_path: str
    question: str


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using PyPDF2."""
    try:
        import PyPDF2

        with open(pdf_path, "rb") as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        return text
    except ImportError:
        raise ImportError("PyPDF2 not installed. Run: pip install PyPDF2")


def simple_search(text: str, query: str, max_chunks: int = 3) -> list[dict]:
    """Simple text search to find relevant chunks."""
    # Split into sentences/chunks
    sentences = re.split(r"(?<=[.!?])\s+", text)

    # Normalize query
    query_words = set(query.lower().split())

    # Score each sentence
    scored_sentences = []
    for sentence in sentences:
        if len(sentence.strip()) < 20:  # Skip very short sentences
            continue

        sentence_lower = sentence.lower()
        # Count matching words
        matches = sum(1 for word in query_words if word in sentence_lower)
        if matches > 0:
            scored_sentences.append(
                {
                    "text": sentence.strip(),
                    "score": matches
                    / len(query_words),  # Percentage of query words found
                }
            )

    # Sort by score
    scored_sentences.sort(key=lambda x: x["score"], reverse=True)

    return scored_sentences[:max_chunks]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/pdf/ask")
async def ask_pdf(request: PDFQuestionRequest):
    """Ask a question about a PDF document."""
    try:
        # Handle relative paths from project root
        pdf_path = request.pdf_path
        if not Path(pdf_path).is_absolute():
            # Try relative to backend directory
            backend_dir = Path(__file__).parent
            pdf_file = backend_dir / pdf_path
            if not pdf_file.exists():
                # Try relative to project root
                project_root = backend_dir.parent
                pdf_file = project_root / pdf_path
        else:
            pdf_file = Path(pdf_path)

        if not pdf_file.exists():
            raise HTTPException(
                status_code=404, detail=f"PDF not found: {request.pdf_path}"
            )

        # Extract text
        logger.info(f"Extracting text from: {request.pdf_path}")
        text = extract_text_from_pdf(str(pdf_file))

        if not text.strip():
            return {
                "answer": "Could not extract text from the PDF. It might be empty or image-based.",
                "sources": [],
                "pdf_name": pdf_file.name,
            }

        # Find relevant chunks
        logger.info(f"Searching for: {request.question}")
        relevant_chunks = simple_search(text, request.question)

        if not relevant_chunks:
            return {
                "answer": "I couldn't find relevant information in the PDF to answer your question.",
                "sources": [],
                "pdf_name": pdf_file.name,
                "total_results": 0,
            }

        # Build answer from top chunks
        answer_parts = []
        for i, chunk in enumerate(relevant_chunks[:2], 1):
            answer_parts.append(f"[{i}] {chunk['text']}")

        answer = "\n\n".join(answer_parts)

        return {
            "answer": answer,
            "sources": relevant_chunks,
            "pdf_name": pdf_file.name,
            "total_results": len(relevant_chunks),
        }

    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pdf/reset")
async def reset_pdf():
    """Reset endpoint (no-op for simple version)."""
    return {"status": "success", "message": "Reset successful"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8010)
