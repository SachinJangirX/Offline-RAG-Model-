from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import os
import re
import uuid

# ── Tunable constants ──────────────────────────────────────────────────────────
CHUNK_SIZE    = 400   # chars ≈ 60-80 words — one focused concept per chunk
CHUNK_OVERLAP = 80    # 20 % overlap preserves sentence context at boundaries
MIN_CHUNK_LEN = 40    # discard near-empty chunks (PDF artefacts)


def clean_text(text: str) -> str:
    """
    Strip PDF extraction noise that pollutes embedding quality:
      - run-on spaces / tabs
      - excessive blank lines
      - lone page numbers (e.g. a line that is just "12")
      - divider lines made of dashes, dots, or equals signs
      - leading/trailing whitespace
    """
    text = re.sub(r'[ \t]+',  ' ',  text)                               # collapse spaces
    text = re.sub(r'^\s*\d{1,4}\s*$',    '', text, flags=re.MULTILINE) # lone page numbers
    text = re.sub(r'^\s*[-_.=*]{3,}\s*$', '', text, flags=re.MULTILINE) # divider lines
    return text.strip()


def ingest_pdf(file_path: str, db) -> int:
    filename = os.path.basename(file_path)

    loader = PyPDFLoader(file_path)
    pages  = loader.load()

    # Clean each page's raw text before splitting
    for page in pages:
        page.page_content = clean_text(page.page_content)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""],
        length_function=len,
    )
    chunks = splitter.split_documents(pages)

    # Discard near-empty chunks that survived cleaning
    chunks = [c for c in chunks if len(c.page_content.strip()) >= MIN_CHUNK_LEN]

    for i, chunk in enumerate(chunks):
        chunk.metadata["source"]    = filename
        chunk.metadata["page"]      = int(chunk.metadata.get("page", 0))
        chunk.metadata["chunk_id"]  = str(uuid.uuid4())
        chunk.metadata["chunk_seq"] = i   # document-order index used when sorting for report

    db.add_documents(chunks)

    count = len(chunks)
    print(f"[Ingest] {filename}: {count} chunks "
          f"(size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})")
    return count
