"""Quick PDF Q&A endpoint for demo."""

import logging
from pathlib import Path
from typing import Any

import cognee

logger = logging.getLogger(__name__)

DATASET_NAME = "pdf_demo"


async def process_pdf_and_ask(pdf_path: str, question: str) -> dict[str, Any]:
    """Process a PDF and answer a question about it.
    
    Args:
        pdf_path: Path to the PDF file
        question: Natural language question about the PDF
        
    Returns:
        Dictionary with answer and sources
    """
    try:
        # Verify the PDF exists
        pdf_file = Path(pdf_path)
        if not pdf_file.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")
        
        # Add PDF to cognee
        logger.info(f"Adding PDF: {pdf_path}")
        await cognee.add(str(pdf_file), dataset_name=DATASET_NAME)
        
        # Cognify to extract knowledge
        logger.info("Processing PDF with cognee...")
        await cognee.cognify(datasets=[DATASET_NAME])
        
        # Search for answer
        logger.info(f"Searching for: {question}")
        search_results = await cognee.search("QUERY", query_text=question)
        
        # Format response
        if not search_results:
            return {
                "answer": "I couldn't find relevant information in the PDF to answer your question.",
                "sources": [],
                "pdf_name": pdf_file.name
            }
        
        # Extract answer from results
        answer_text = ""
        sources = []
        
        for result in search_results:
            # Cognee returns different result types, handle them flexibly
            if hasattr(result, 'text'):
                if not answer_text:
                    answer_text = result.text
                sources.append({
                    "text": result.text[:200] + "..." if len(result.text) > 200 else result.text,
                    "score": getattr(result, 'score', None)
                })
        
        if not answer_text and search_results:
            # Fallback: try to get any text from first result
            first = search_results[0]
            if isinstance(first, dict):
                answer_text = first.get('text', str(first))
            else:
                answer_text = str(first)
        
        return {
            "answer": answer_text or "Found some results but couldn't extract clear answer.",
            "sources": sources[:3],  # Top 3 sources
            "pdf_name": pdf_file.name,
            "total_results": len(search_results)
        }
        
    except Exception as e:
        logger.error(f"Error processing PDF Q&A: {e}", exc_info=True)
        raise


async def reset_pdf_dataset():
    """Reset the PDF demo dataset for a fresh start."""
    try:
        await cognee.prune.prune_data(dataset_name=DATASET_NAME)
        await cognee.prune.prune_system(metadata=True)
        logger.info("PDF dataset reset successfully")
    except Exception as e:
        logger.warning(f"Error resetting dataset (may not exist yet): {e}")
