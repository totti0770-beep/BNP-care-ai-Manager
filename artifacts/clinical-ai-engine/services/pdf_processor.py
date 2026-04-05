"""
PDF Processing — LangChain PyPDFLoader + RecursiveCharacterTextSplitter
Pipeline: bytes → temp file → PyPDFLoader → RecursiveCharacterTextSplitter → chunks
"""
import os
import tempfile
import logging
from typing import List

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500        # characters (~125 tokens for clinical text)
CHUNK_OVERLAP = 50


def process_pdf(pdf_bytes: bytes) -> List[dict]:
    """
    Full pipeline:
      1. Write bytes to temp file
      2. Load with LangChain PyPDFLoader (page-aware)
      3. Split with RecursiveCharacterTextSplitter (~500 chars / ~125 tokens)
      4. Return list of chunk dicts: {content, page_number, chunk_index, token_count}
    """
    from langchain_community.document_loaders import PyPDFLoader
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    # Write to a named temp file so PyPDFLoader can read it
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        loader = PyPDFLoader(tmp_path)
        pages = loader.load()           # List[Document] — one per PDF page

        if not pages:
            raise ValueError("No readable text found in the PDF.")

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=len,
        )

        all_chunks = splitter.split_documents(pages)

        if not all_chunks:
            raise ValueError("PDF contains no extractable text content.")

        chunks = []
        for idx, doc in enumerate(all_chunks):
            content = doc.page_content.strip()
            if len(content) < 20:       # skip near-empty fragments
                continue
            chunks.append({
                "content": content,
                "page_number": doc.metadata.get("page", 0) + 1,   # PyPDFLoader is 0-indexed
                "chunk_index": idx,
                "token_count": len(content.split()),
            })

        logger.info(f"PDF processed: {len(pages)} pages → {len(chunks)} chunks")
        return chunks

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
