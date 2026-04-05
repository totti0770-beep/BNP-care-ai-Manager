"""PDF text extraction and chunking via PyMuPDF + LangChain text splitter."""
import fitz  # PyMuPDF
import logging
from typing import List, Tuple
from langchain_text_splitters import RecursiveCharacterTextSplitter
import tiktoken

logger = logging.getLogger(__name__)

_tokenizer = tiktoken.get_encoding("cl100k_base")

CHUNK_SIZE_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 50


def _count_tokens(text: str) -> int:
    return len(_tokenizer.encode(text))


def extract_text_from_pdf(pdf_bytes: bytes) -> List[Tuple[int, str]]:
    """
    Extract text from PDF.
    Returns list of (page_number, page_text) tuples.
    """
    pages = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text").strip()
        if text:
            pages.append((page_num + 1, text))
    doc.close()
    return pages


def chunk_text(pages: List[Tuple[int, str]]) -> List[dict]:
    """
    Chunk extracted page text into ~500-token chunks.
    Returns list of chunk dicts: {content, page_number, chunk_index, token_count}
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1800,            # ~500 tokens ≈ ~1800 chars for clinical text
        chunk_overlap=200,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = []
    global_index = 0

    for page_num, page_text in pages:
        page_chunks = splitter.split_text(page_text)
        for chunk_text_part in page_chunks:
            token_count = _count_tokens(chunk_text_part)
            if token_count < 10:
                continue
            chunks.append({
                "content": chunk_text_part.strip(),
                "page_number": page_num,
                "chunk_index": global_index,
                "token_count": token_count,
            })
            global_index += 1

    logger.info(f"Chunked into {len(chunks)} chunks from {len(pages)} pages")
    return chunks


def process_pdf(pdf_bytes: bytes) -> List[dict]:
    """Full pipeline: extract → chunk."""
    pages = extract_text_from_pdf(pdf_bytes)
    if not pages:
        raise ValueError("No readable text found in PDF.")
    return chunk_text(pages)
