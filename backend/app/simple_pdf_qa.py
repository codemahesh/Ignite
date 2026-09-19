"""Simplified PDF Q&A for quick demo without full cognee setup."""

import logging
from pathlib import Path
from typing import Any
import re

logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using PyPDF2."""
    try:
        import PyPDF2
        
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        return text
    except ImportError:
        raise ImportError("PyPDF2 not installed. Run: pip install PyPDF2")
    except Exception as e:
        logger.error(f"Error extracting PDF: {e}")
        raise


def simple_search(text: str, query: str, max_chunks: int = 3) -> list[dict]:
    """Simple text search to find relevant chunks."""
    # Split into sentences/chunks
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
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
            scored_sentences.append({
                'text': sentence.strip(),
                'score': matches / len(query_words)  # Percentage of query words found
            })
    
    # Sort by score
    scored_sentences.sort(key=lambda x: x['score'], reverse=True)
    
    return scored_sentences[:max_chunks]


def simple_pdf_qa(pdf_path: str, question: str) -> dict[str, Any]:
    """Quick PDF Q&A without heavy ML dependencies."""
    try:
        # Verify PDF exists
        pdf_file = Path(pdf_path)
        if not pdf_file.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")
        
        # Extract text
        logger.info(f"Extracting text from: {pdf_path}")
        text = extract_text_from_pdf(str(pdf_file))
        
        if not text.strip():
            return {
                "answer": "Could not extract text from the PDF. It might be empty or image-based.",
                "sources": [],
                "pdf_name": pdf_file.name
            }
        
        # Find relevant chunks
        logger.info(f"Searching for: {question}")
        relevant_chunks = simple_search(text, question)
        
        if not relevant_chunks:
            return {
                "answer": "I couldn't find relevant information in the PDF to answer your question.",
                "sources": [],
                "pdf_name": pdf_file.name,
                "total_results": 0
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
            "total_results": len(relevant_chunks)
        }
        
    except Exception as e:
        logger.error(f"Error in simple PDF Q&A: {e}", exc_info=True)
        raise
