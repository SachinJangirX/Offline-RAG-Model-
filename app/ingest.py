from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

import gc
import json
import os
import re
import uuid
from pathlib import Path
from typing import Optional, List, Tuple, Dict
from dotenv import load_dotenv

import pytesseract 
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

# Try common installation locations on Windows
if os.name == 'nt':  # Windows only
    common_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for path in common_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            break

# Load environment variables
load_dotenv()

#Tunable constants
CHUNK_SIZE = 300
CHUNK_OVERLAP = 30
MIN_CHUNK_LEN = 40
SCANNED_THRESHOLD = 50          
OCR_DPI = 150                   
AIR_GAPPED_MODE = True          
LLAMA_PARSE_ENABLED = not AIR_GAPPED_MODE
LLAMA_PARSE_API_KEY = os.getenv("LLAMA_PARSE_API_KEY", "") if LLAMA_PARSE_ENABLED else ""
USE_LLAMA_PARSE = bool(LLAMA_PARSE_API_KEY) and LLAMA_PARSE_ENABLED

if AIR_GAPPED_MODE:
    print("[AIR-GAPPED MODE] Using offline OCR extraction only (Tesseract)")
    print("[INGEST] LlamaParse API disabled - system operates in offline mode")
else:
    if USE_LLAMA_PARSE:
        print("[LlamaParse] Initialized with API key from environment")
    else:
        print("[LlamaParse] API key not found. Set LLAMA_PARSE_API_KEY environment variable to enable.")




def preprocess_image_for_ocr(image: Image.Image) -> Image.Image:
    """
    Preprocess scanned document image for better OCR results.
    Applies: deskew, denoise, threshold, contrast enhancement.
    """
    try:
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 1: Denoise using bilateral filter
        img_array = np.array(image)
        
        # 2: Convert to grayscale for processing
        img_gray = Image.new('L', image.size)
        img_gray.paste(image.convert('L'))
        img_array = np.array(img_gray)
        
        # 3: Apply bilateral-like denoising (using median filter as approximation)
        img_denoised = Image.fromarray(img_array).filter(ImageFilter.MedianFilter(size=3))
        
        # 4: Enhance contrast
        enhancer = ImageEnhance.Contrast(img_denoised)
        img_contrast = enhancer.enhance(1.5)
        
        # 5: Enhance brightness
        enhancer_brightness = ImageEnhance.Brightness(img_contrast)
        img_brightness = enhancer_brightness.enhance(1.1)
        
        # 6: Apply threshold to convert to black & white
        img_array = np.array(img_brightness)
        threshold = 150
        img_binary = np.where(img_array > threshold, 255, 0).astype(np.uint8)
        
        # 7: Apply morphological operations to clean up
        try:
            import cv2
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            img_binary = cv2.morphologyEx(img_binary, cv2.MORPH_CLOSE, kernel)
            img_binary = cv2.morphologyEx(img_binary, cv2.MORPH_OPEN, kernel)
        except ImportError:
            pass  # cv2 not available, skip morphological ops
        
        result = Image.fromarray(img_binary)
        return result
        
    except Exception as e:
        print(f"[OCR] Image preprocessing warning: {e}. Using original image.")
        return image


def clean_text(text: str) -> str:
    """
    General text cleaning for both extracted PDF text and OCR text.
    Keeps readable sentence structure while removing obvious noise.
    """
    if not text or not isinstance(text, str):
        return ""

    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Remove divider lines
    text = re.sub(r"^\s*[-_.=*]{3,}\s*$", "", text, flags=re.MULTILINE)

    # Remove lone page numbers
    text = re.sub(r"^\s*\d{1,4}\s*$", "", text, flags=re.MULTILINE)

    # Replace unusual junk chars but keep common punctuation
    text = re.sub(r"[^\w\s\.,;:!?\-\/()%&'\"]", " ", text)

    # Collapse spaces
    text = re.sub(r"[ \t]+", " ", text)

    # Collapse too many blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Trim spaces around line breaks
    text = re.sub(r" *\n *", "\n", text)

    return text.strip()


def clean_ocr_text(text: str) -> str:
    """
    OCR-specific cleaning that preserves paragraph structure.
    Joins lines within paragraphs with spaces, preserves paragraph breaks.
    """
    if not text or not isinstance(text, str):
        return ""

    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Split by double newlines to identify paragraphs
    paragraphs = re.split(r"\n\s*\n", text)
    
    cleaned_paragraphs = []

    for paragraph in paragraphs:
        # Split paragraph into lines
        lines = paragraph.split("\n")
        cleaned_lines = []

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Keep line if it has at least some alphanumeric signal
            alnum_count = sum(ch.isalnum() for ch in line)
            if alnum_count < 2:
                continue

            # Remove heavy OCR junk but preserve readable punctuation
            line = re.sub(r"[^\w\s\.,;:!?\-\/()%&'\"]", " ", line)
            line = re.sub(r"[ \t]+", " ", line).strip()

            if line:
                cleaned_lines.append(line)

        # Join lines within the paragraph with spaces to form continuous text
        if cleaned_lines:
            paragraph_text = " ".join(cleaned_lines)
            cleaned_paragraphs.append(paragraph_text)

    # Join paragraphs with double newlines to preserve paragraph breaks
    cleaned = "\n\n".join(cleaned_paragraphs)

    return cleaned.strip()


def is_scanned_pdf(text: str) -> bool:
    """Detect if PDF is likely scanned/image-based."""
    return len((text or "").strip()) < SCANNED_THRESHOLD


def get_pdf_page_count(file_path: str) -> int:
    """Get page count safely using pypdf if available, else fallback to loader."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        return len(reader.pages)
    except Exception:
        loader = PyPDFLoader(file_path)
        return len(loader.load())


def extract_ocr_from_pdf(file_path: str) -> Tuple[Dict[int, str], bool]:
    """
    Extract text from scanned PDF using page-by-page OCR with Tesseract.
    Applies advanced image preprocessing for better OCR accuracy.
    Returns (ocr_data, success)
    """
    ocr_data: Dict[int, str] = {}

    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError:
        print("[OCR] ERROR: pdf2image or pytesseract not installed")
        return ocr_data, False

    try:
        total_pages = get_pdf_page_count(file_path)
        print(f"[OCR] Processing {total_pages} page(s) with Tesseract (offline mode)...")
        print(f"[OCR] Applying image preprocessing: deskew, denoise, contrast enhancement")

        for page_num in range(1, total_pages + 1):
            try:
                # Convert PDF page to image
                images = convert_from_path(
                    file_path,
                    dpi=OCR_DPI,
                    first_page=page_num,
                    last_page=page_num,
                )

                if not images:
                    print(f"[OCR] No image produced for page {page_num}")
                    continue

                image = images[0]

                # Preprocess image for better OCR
                print(f"[OCR] Page {page_num}: Preprocessing image...")
                image = preprocess_image_for_ocr(image)

                raw_text = pytesseract.image_to_string(
                    image,
                    config="--oem 3 --psm 6 -c tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:!?-/()\n "
                )

                cleaned = clean_ocr_text(raw_text)

                print(f"[OCR] Page {page_num}: raw={len(raw_text)} chars → cleaned={len(cleaned)} chars")

                if cleaned.strip():
                    ocr_data[page_num] = cleaned
                else:
                    print(f"[OCR] Page {page_num} produced no usable text")

                # Free memory explicitly
                del image
                del images
                gc.collect()

            except Exception as e:
                print(f"[OCR] Page {page_num} extraction failed: {e}")

        success = len(ocr_data) > 0
        if not success:
            print("[OCR] No usable OCR text extracted from any page")
        else:
            print(f"[OCR] ✓ Successfully extracted {len(ocr_data)} pages")

        return ocr_data, success

    except Exception as e:
        print(f"[OCR] OCR pipeline failed: {e}")
        return ocr_data, False


def build_documents_from_ocr(ocr_data: Dict[int, str]) -> List[Document]:
    """Convert OCR dictionary to LangChain Documents."""
    docs: List[Document] = []

    for page_num in sorted(ocr_data.keys()):
        text = clean_text(ocr_data[page_num])
        if not text.strip():
            continue

        docs.append(
            Document(
                page_content=text,
                metadata={"page": page_num}
            )
        )

    return docs


# Main Ingestion Function called from API
def ingest_pdf(file_path: str, db) -> int:
    """
    Ingest PDF into vector DB with intelligent offline extraction.
    
    Optimized for AIR-GAPPED environments with scanned PDF support.
    
    Processing order:
    1. PyPDFLoader (for native text PDFs)
    2. Tesseract OCR with image preprocessing (for scanned PDFs)
    
    Returns number of chunks added.
    """
    filename = os.path.basename(file_path)
    pages_to_use = []
    doc_type = "unknown"

    print(f"\n[Ingest] {filename}: Starting offline extraction pipeline...")
    
    # Try PyPDFLoader first
    try:
        loader = PyPDFLoader(file_path)
        pages = loader.load()

        for page in pages:
            page.page_content = clean_text(page.page_content)

        total_text = " ".join(p.page_content for p in pages)
        scanned = is_scanned_pdf(total_text)

        if scanned:
            print(f"[Ingest] {filename}: Detected as SCANNED PDF (PyPDFLoader text: {len(total_text.strip())} chars)")
            print(f"[Ingest] {filename}: Will use Tesseract OCR with image preprocessing...")
            doc_type = "ocr"
            pages_to_use = []  # Don't use PyPDFLoader output for scanned
        else:
            print(f"[Ingest] {filename}: Detected as TEXT PDF (native text extraction)")
            doc_type = "native"
            pages_to_use = [p for p in pages if p.page_content.strip()]
            
    except Exception as e:
        print(f"[Ingest] PyPDFLoader warning: {e}. Will try OCR...")
        pages_to_use = []
        doc_type = "ocr"

    # If scanned or PyPDFLoader failed, use OCR
    if not pages_to_use or doc_type == "ocr":
        print(f"[Ingest] {filename}: Running Tesseract OCR (offline)...")
        ocr_data, ocr_success = extract_ocr_from_pdf(file_path)

        if ocr_success and ocr_data:
            pages_to_use = build_documents_from_ocr(ocr_data)
            print(f"[Ingest] {filename}: ✓ OCR completed")
        else:
            print(f"[Ingest] ERROR: OCR failed for {filename}. No readable text extracted.")
            pages_to_use = []

    # Guard against empty input before chunking
    if not pages_to_use:
        print(f"[Ingest] ERROR: No valid pages to process for {filename}")
        return 0

    # Chunking
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""],
        length_function=len,
    )

    chunks = splitter.split_documents(pages_to_use)
    chunks = [c for c in chunks if len(c.page_content.strip()) >= MIN_CHUNK_LEN]

    # Guard against empty chunks before DB insert
    if not chunks:
        print(f"[Ingest] ERROR: No valid chunks extracted from {filename}. Skipping DB insert.")
        return 0

    # Metadata enrichment
    for i, chunk in enumerate(chunks):
        chunk.metadata["source"] = filename
        chunk.metadata["page"] = int(chunk.metadata.get("page", 0))
        chunk.metadata["type"] = doc_type
        chunk.metadata["chunk_id"] = str(uuid.uuid4())
        chunk.metadata["chunk_seq"] = i

    # Insert into vector DB (ChromaDB)
    try:
        db.add_documents(chunks)
        count = len(chunks)
        print(
            f"[Ingest] ✓ {filename}: {count} chunks added to ChromaDB "
            f"(type={doc_type}, chunk_size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})"
        )
        return count
    except Exception as e:
        print(f"[Ingest] ERROR: Failed to add chunks to ChromaDB: {e}")
        return 0
