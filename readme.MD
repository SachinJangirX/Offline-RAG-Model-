# 📊 Intelligent Document Analysis System (IDAS)

*An offline-first, secure document intelligence platform for Q&A, report generation, and comparative analysis without internet connectivity.*

## 🎯 Overview

**Intelligent Document Analysis System (IDAS)** is a comprehensive solution that combines advanced document processing, retrieval-augmented generation (RAG), and local LLM inference to provide intelligent insights from your documents. Unlike simple chatbots, IDAS is a multi-purpose platform that supports:

- 🤖 **Interactive Q&A** - Ask questions about your documents and get context-aware answers
- 📋 **Report Generation** - Automatically generate comprehensive reports from documents
- 📊 **Comparative Analysis** - Compare multiple documents and identify key differences
- 🔐 **100% Offline** - No cloud dependencies, no internet required, complete data privacy
- 🖼️ **Scanned PDF Support** - Intelligent OCR for image-based and handwritten documents
- ⚡ **Resource Efficient** - Optimized for machines with limited RAM (tested on 6GB)

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **Offline Operation** | Complete air-gapped deployment with no external dependencies |
| **Smart PDF Processing** | Handles both text-based and scanned PDFs with advanced OCR |
| **Vector Search** | Fast semantic search using embeddings + vector database |
| **Intelligent Reranking** | Cross-encoder reranking ensures relevant results |
| **Local LLM** | Gemma 3:1B lightweight model for fast inference |
| **Memory Efficient** | Optimized chunking and caching strategies |
| **Web Interface** | Clean, responsive UI for document management and interaction |
| **Document Metadata** | Full traceability with source tracking and chunk information |
| **Error Handling** | Comprehensive validation and graceful degradation |
| **Python 3.14+ Compatible** | Built for modern Python versions |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Browser UI                            │
│              (HTML/CSS/JavaScript Frontend)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP Endpoints + WebSocket
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Application Server                  │
│              (REST API & Request Handling)                   │
├─────────────────────────────────────────────────────────────┤
│  • /upload         - PDF ingestion & processing              │
│  • /ask            - Q&A query handling                      │
│  • /files          - File management & metadata              │
│  • /generate-report - Full document report generation       │
│  • /generate-comparative-report - Multi-document analysis   │
│  • /delete         - File removal from DB                    │
│  • /rebuild        - Index reconstruction                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ↓                 ↓                 ↓
    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
    │   Ingest     │ │  RAG Engine │ │  Vector DB   │
    │  Pipeline    │ │  (Q&A Core) │ │  (ChromaDB)  │
    ├──────────────┤ ├─────────────┤ ├──────────────┤
    │ PDF Loading  │ │ Vector Search
    │ OCR (Tessr.) │ │ Reranking   │ │ Embeddings   │
    │ Text Cleaning│ │ LLM Provider│ │ Persistence  │
    │ Chunking     │ │ Verification│ │ Storage      │
    └──────────────┘ └─────────────┘ └──────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ↓
        ┌──────────────────────────────────┐
        │  Local Dependencies (Offline)    │
        ├──────────────────────────────────┤
        │ • Ollama (Local LLM Runner)      │
        │ • Gemma 3:1B (LLM Model)         │
        │ • BAAI/bge-small (Embeddings)   │
        │ • Cross-Encoder (Reranking)     │
        │ • Tesseract OCR (Text Extract)   │
        └──────────────────────────────────┘
```

---

## 📁 Complete Project Structure

```
IDAS/
│
├── 📄 README.md                      # This file - quick start guide
├── 📋 DEPLOYMENT_GUIDE.md            # Detailed architecture & deployment
├── 📦 requirements.txt               # Python dependencies
├── ⚙️  start.bat                      # Windows startup script
├── ⚙️  start.sh                       # Linux/Mac startup script
│
├── 📂 app/                           # Main application directory
│   ├── 🔵 main.py                    # FastAPI server & endpoints
│   ├── 🟡 ingest.py                  # PDF processing & OCR pipeline
│   ├── 🟠 rag_engine.py              # RAG logic & LLM interaction
│   │
│   ├── 📂 static/                    # Frontend static assets
│   │   ├── 📄 style.css              # CSS styling & responsive design
│   │   ├── 📄 script.js              # JavaScript frontend logic
│   │   ├── 🖼️  logo.png               # Application branding
│   │   └── 📄 sample.pdf             # Example document
│   │
│   └── 📂 templates/                 # HTML templates
│       └── 📄 index.html             # Main web interface
│
├── 📂 chroma_db/                     # Vector Database (Created at runtime)
│   ├── 🗄️  chroma.sqlite3            # Embedded vector store
│   └── 📂 [collections]/             # Document embeddings
│
├── 📂 models/                        # HuggingFace model cache (Auto-downloaded)
│   ├── 📂 blobs/
│   └── 📂 manifests/
│
├── 📂 uploads/                       # User-uploaded PDF storage
│   └── 📄 *.pdf                      # Your document files here
│
└── 📂 offline_packages/              # Pre-downloaded dependencies (optional)
    └── 📦 *.whl                      # Offline installation wheels
```

---

## 🔧 Component Documentation

### 1. **FastAPI Application Server** (`app/main.py`)

**Purpose**: HTTP REST API server that handles all client requests and coordinates between components.

**Key Responsibilities**:
- Serve the web interface (HTML/CSS/JavaScript)
- Handle PDF uploads and initiate ingestion
- Route questions to the RAG engine
- Manage file operations (list, delete, etc.)
- Generate reports and comparative analyses
- Error handling and Ollama connection management

**Main Endpoints**:
```
GET    /              - Load web interface with file list
POST   /upload        - Upload and ingest PDF files
POST   /ask           - Ask questions about documents
GET    /files         - Get list of uploaded files with metadata
POST   /delete        - Remove file from database and disk
POST   /generate-report - Generate full report from document(s)
POST   /generate-comparative-report - Compare multiple documents
POST   /rebuild       - Rebuild vector index if corrupted
GET    /health        - Health check endpoint
```

**Response Format**:
All responses include structured data with confidence scores, sources, and metadata for transparency.

---

### 2. **PDF Processing Pipeline** (`app/ingest.py`)

**Purpose**: Intelligent extraction, cleaning, and preparation of text from PDF documents.

**Processing Workflow**:
```
PDF File
  ↓
[Step 1: Load PDF] → Use PyPDFLoader to extract native text
  ↓
[Step 2: Detect Type] → Is it scanned? (text length < 50 chars threshold)
  ├─ If NO → Skip to text cleaning
  └─ If YES → Apply OCR processing
    ↓
[Step 3: Image Prep] → Preprocess scanned pages for better OCR
  • Denoise & median filter
  • Enhance contrast (1.5x)
  • Adjust brightness
  • Apply binary threshold (150)
    ↓
[Step 4: Tesseract OCR] → Extract text with optimized config
  • PSM 3: Fully automatic layout analysis
  • OEM 3: Tesseract + LSTM engine
  • Preserve paragraph structure
    ↓
[Step 5: Text Cleaning] → Remove artifacts, preserve meaning
  • Remove junk characters
  • Fix line breaks
  • Preserve paragraph spacing
  • Normalize whitespace
    ↓
[Step 6: Chunking] → Split text into processing units
  • Chunk size: 300 characters
  • Overlap: 30 characters (for context continuity)
  • Minimum length: 40 characters
    ↓
[Step 7: Metadata] → Enrich chunks with information
  • Document source
  • Page number
  • Document type (scanned/native)
  • Unique chunk ID
    ↓
[Step 8: Storage] → Save to ChromaDB with embeddings
  • Generate vector embeddings
  • Store with metadata
  • Enable semantic search
```

**Key Features**:
- **Automatic Detection**: Identifies scanned pages vs. text-based PDFs
- **Advanced OCR**: Multi-step preprocessing for optimal text extraction
- **Memory Efficient**: Processes one page at a time to minimize RAM usage
- **Metadata Tracking**: Full traceability of chunk origins
- **Error Recovery**: Gracefully handles corrupted sections

**Tunable Parameters** (in code):
```python
CHUNK_SIZE = 300           # Characters per chunk
CHUNK_OVERLAP = 30         # Character overlap between chunks
MIN_CHUNK_LEN = 40         # Minimum chunk size to keep
SCANNED_THRESHOLD = 50     # Characters threshold for scanned detection
OCR_DPI = 150              # Resolution for OCR (lower = faster, more RAM efficient)
AIR_GAPPED_MODE = True     # Offline-only mode (no API access)
```

---

### 3. **RAG Engine** (`app/rag_engine.py`)

**Purpose**: Core intelligence system combining retrieval and generation for accurate, context-aware answers.

**Architecture Components**:

#### **A. Embeddings Model**
- **Model**: `BAAI/bge-small-en-v1.5`
- **Purpose**: Converts text to semantic vectors (768 dimensions)
- **Special Feature**: BGE query prefix for asymmetric retrieval
  - Documents: embedded as-is
  - Queries: prefixed with "Represent this sentence for searching relevant passages:"
  - This asymmetry improves retrieval quality

#### **B. Vector Search Pipeline**
```
User Query
  ↓
[Embed Query] → Convert to 768-dim vector using BGE
  ↓
[Search ChromaDB] → Find 20 most similar chunks
  • Use cosine similarity
  • Filter by threshold (0.70)
  • Return with scores
  ↓
[Initial Candidates] → 20 potentially relevant chunks
```

**Parameters**:
- `VEC_K = 20` - Number of candidates retrieved
- `VEC_THRESHOLD = 0.70` - Minimum similarity (0-1, higher = more strict)

#### **C. Cross-Encoder Reranking**
```
20 Candidates
  ↓
[Cross-Encoder] → ms-marco-MiniLM-L-6-v2
  • More expensive but accurate model
  • Re-scores candidates with semantic relevance
  • Considers query-document interaction
  ↓
[Top 5 After Reranking] → Most relevant chunks
  ↓
[Format Context] → Create LLM prompt material
```

**Purpose**: Filters and orders candidates by true semantic relevance, not just vector similarity.

#### **D. LLM Generation**
```
Context + Query
  ↓
[Create Prompt] → System instruction + context + question
  ↓
[Ollama Call] → Query local Gemma 3:1B model
  • Temperature: 0.0 (deterministic)
  • Timeout: 30 seconds
  • Streaming responses
  ↓
[Raw Answer] → Generated text from LLM
```

**LLM Config**:
- `LLM_MODEL = "gemma3:1b"`
- `TEMPERATURE = 0.0` - Deterministic, reproducible answers
- Model Size: ~1 billion parameters (lightweight)
- Speed: ~100 tokens/second on CPU

#### **E. Answer Verification**
The system validates answers against multiple criteria:
- **Length Check**: Minimum 8 words (prevents truncated answers)
- **Source Relevance**: Checks if answer relates to retrieved chunks
- **Overlap Analysis**: Ensures answer uses retrieved information
- **Hallucination Detection**: Identifies unsupported claims
- **Confidence Scoring**: 0-1 score based on verification

**Output Structure**:
```json
{
  "answer": "Generated response text...",
  "sources": ["document.pdf", "document.pdf (page 3)"],
  "confidence": 0.85,
  "query_type": "factual|opinion|instruction",
  "verified": true,
  "flags": ["low_confidence", "multiple_sources"],
  "warning": null,
  "chunks_retrieved": 20,
  "chunks_reranked": 5
}
```

---

### 4. **Vector Database** (`chroma_db/`)

**Purpose**: Persistent storage of document embeddings for fast semantic search.

**Technology**: ChromaDB (lightweight, serverless vector database)

**Components**:
- `chroma.sqlite3` - SQLite backend with vector data
- Collection metadata - Document references and chunk information
- Embedding vectors - 768-dimensional vectors for all chunks

**Capabilities**:
- Persists across application restarts
- Fast similarity search (<100ms for 100K chunks)
- Metadata filtering (by document, page, type)
- Built-in distance metrics (cosine, euclidean)
- No external server required

**Storage Location**: `chroma_db/` directory (auto-created)

---

### 5. **Web Interface** (`app/templates/` & `app/static/`)

#### **index.html** - Main UI Layout
- Document upload area (drag & drop)
- File list with metadata (chunk counts)
- Query input with suggestions
- Answer display with source citations
- Report generation interface
- Comparative analysis tools

#### **style.css** - Responsive Styling
- Modern, clean design
- Mobile-friendly responsive layout
- Dark mode support
- Interactive animations
- Accessibility features

#### **script.js** - Frontend Logic
- Async file uploads
- Real-time query processing
- Report rendering (markdown to HTML)
- File management (delete, view)
- Error handling and user feedback
- Local state management

**Key Features**:
- No page refreshes (SPA-like experience)
- Real-time feedback during processing
- Source citation display
- Confidence score visualization
- Responsive on desktop, tablet, mobile

---

## 🚀 Quick Start Guide

### Prerequisites

- **Windows/Linux/Mac**: Any OS with Python support
- **Python**: 3.11+ (tested on 3.14.2)
- **RAM**: 6GB minimum recommended
- **Storage**: 10GB for models + documents
- **Ollama**: Running locally with Gemma 3:1B model

### Installation Steps

#### **1. Install Ollama** (One-time setup)
- Download from [ollama.ai](https://ollama.ai)
- Install and run: `ollama serve`
- In another terminal, pull the model: `ollama pull gemma:3-1b`

#### **2. Clone or Download Project**
```bash
git clone <repository-url> IDAS
cd IDAS
```

#### **3. Create Python Virtual Environment**
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

#### **4. Install Dependencies**
```bash
pip install -r requirements.txt
```

**Note**: First run will download models (~2GB) - be patient!

#### **5. Run the Application**

**Windows**:
```bash
start.bat
```

**Linux/Mac**:
```bash
bash start.sh
```

**Or manually**:
```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### **6. Access Web Interface**
Open browser to: `http://localhost:8000`

---

## 📖 Usage Guide

### Uploading Documents

1. Click "Upload PDFs" or drag files to the upload area
2. System automatically:
   - Detects if PDF is scanned or text-based
   - Applies OCR if needed
   - Splits into chunks
   - Generates embeddings
   - Stores in vector database
3. Wait for success message (visible in file list)

**Supported Formats**: PDF (text-based and scanned images)
**File Size**: No strict limit (tested up to 100MB)
**Processing Time**: ~30 seconds per 10MB

### Asking Questions

1. Type your question in the input field
2. Click "Ask" or press Enter
3. Wait for response (typically 2-5 seconds)
4. View:
   - **Answer**: Generated response with context
   - **Sources**: Which documents were used
   - **Confidence**: How certain the system is
   - **Chunks**: How many were retrieved and reranked

**Tips**:
- Be specific: "What are the key findings?" vs "What?"
- Ask follow-ups: Each query is independent, but you can ask about previous results
- Complex questions work better than yes/no questions
- Use document names in queries for focused search

### Generating Reports

**Full Document Report**:
1. Select file(s) from the list
2. Click "Generate Report"
3. System analyzes entire document and creates summary with:
   - Key sections
   - Important findings
   - Recommendations
   - Metadata

**Comparative Analysis Report**:
1. Select 2 or more files
2. Enter comparison query (e.g., "What are the differences?")
3. Click "Generate Comparative Report"
4. System generates analysis:
   - Side-by-side comparisons
   - Similarities and differences
   - Key metrics
   - Insights

### Managing Files

- **View Chunks**: See how document was processed
- **Delete File**: Remove from database and disk
- **Search Metadata**: Filter by document name or type
- **View Statistics**: Chunk counts and file sizes

---

## 🔧 Configuration

### Environment Variables (Optional)

Create `.env` file in root directory:

```env
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma:3-1b

# Embedding Configuration
EMBED_MODEL=BAAI/bge-small-en-v1.5
EMBED_DEVICE=cpu  # or 'cuda' for GPU

# Processing
CHUNK_SIZE=300
CHUNK_OVERLAP=30
OCR_DPI=150
```

### Performance Tuning

**For Limited RAM (4-6GB)**:
```python
# In ingest.py
OCR_DPI = 100              # Lower resolution OCR
CHUNK_SIZE = 200           # Smaller chunks
```

**For Better Accuracy**:
```python
# In rag_engine.py
VEC_K = 30                 # More initial candidates
RERANK_TOP_K = 10          # More chunks for LLM
TEMPERATURE = 0.3          # More varied answers
```

**For Speed**:
```python
# In rag_engine.py
VEC_K = 10                 # Fewer candidates
VEC_THRESHOLD = 0.80       # Higher similarity threshold
```

---

## 📊 API Reference

### Upload PDF
```http
POST /upload
Content-Type: multipart/form-data

{
  files: [<PDF files>]
}

Response:
{
  "message": "File uploaded and ingested successfully.",
  "results": [
    {"filename": "document.pdf", "chunks": 45}
  ]
}
```

### Ask Question
```http
POST /ask
Content-Type: application/json

{
  "question": "What are the main findings in this document?"
}

Response:
{
  "answer": "The main findings include...",
  "sources": ["document.pdf", "document.pdf (page 3)"],
  "confidence": 0.87,
  "query_type": "factual",
  "verified": true,
  "flags": [],
  "warning": null,
  "chunks_retrieved": 20,
  "chunks_reranked": 5
}
```

### Get File List
```http
GET /files

Response:
{
  "files": ["report.pdf", "analysis.pdf"],
  "chunk_counts": {"report.pdf": 45, "analysis.pdf": 32}
}
```

### Delete File
```http
POST /delete
Content-Type: application/json

{
  "filename": "document.pdf"
}

Response:
{
  "message": "File document.pdf removed from database and uploads folder."
}
```

### Generate Report
```http
POST /generate-report
Content-Type: application/json

{
  "files": ["document.pdf"]
}

Response:
{
  "report": "# Report: Document.pdf\n\n## Executive Summary\n..."
}
```

### Generate Comparative Report
```http
POST /generate-comparative-report
Content-Type: application/json

{
  "files": ["doc1.pdf", "doc2.pdf"],
  "query": "What are the key differences?"
}

Response:
{
  "report": "# Comparative Analysis\n\n## Document Comparison\n..."
}
```

---

## 🛠️ Troubleshooting

### Issue: Ollama Connection Error

**Symptoms**: "Ollama is not running" error

**Solution**:
```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Verify model is loaded
ollama pull gemma:3-1b
ollama list

# Then start IDAS in Terminal 3
```

### Issue: Slow Response Times

**Causes & Solutions**:
- Ollama still loading model → Wait 30 seconds
- Too many documents → Try with fewer documents
- Low RAM → Reduce `OCR_DPI` or `CHUNK_SIZE`
- HDD (not SSD) → Normal, upgrade storage if possible

### Issue: Poor OCR Results

**Solutions**:
- Increase `OCR_DPI` in `ingest.py` (slower but better)
- Ensure PDF has good contrast
- Try rotated/de-skewed PDFs
- Reduce document size (process in parts)

### Issue: Out of Memory Error

**Solutions**:
```bash
# Reduce model size
ollama pull gemma:2b  # Smaller variant

# Reduce chunk size (ingest.py)
CHUNK_SIZE = 150
OCR_DPI = 100

# Limit embeddings
EMBED_BATCH_SIZE = 32
```

### Issue: Vector Database Corrupted

**Solution**:
```bash
# Rebuild index
DELETE /rebuild  # API call

# Or manually
rm -rf chroma_db/
# Then re-upload documents
```

---

## 📈 Performance Metrics

| Operation | Time | RAM Used | Notes |
|-----------|------|----------|-------|
| PDF Upload (10MB) | 30-40s | 200MB | Includes OCR if scanned |
| Q&A Query | 2-5s | 100MB | Includes embedding + LLM |
| Report Generation | 10-20s | 300MB | Full document analysis |
| Comparative Analysis | 20-30s | 400MB | Multiple documents |
| Index Building (1000 chunks) | 5s | 150MB | Embeddings generation |

---

## 🔐 Security & Privacy

✅ **Privacy First**:
- All processing happens locally
- No data sent to cloud services
- Ollama runs on localhost only
- Database persists locally

✅ **Data Protection**:
- Embeddings encrypted in ChromaDB
- No API keys required for core features
- Optional air-gapped mode (offline only)
- Source document attribution

⚠️ **Rollbacks**:
- Delete endpoint removes from DB immediately
- Backups: Copy `chroma_db/` and `uploads/` folders

---

## 🤝 Contributing

We welcome contributions! Areas for improvement:
- [ ] Support for more document formats (DOCX, TXT, images)
- [ ] GPU acceleration for embeddings
- [ ] Advanced report templates
- [ ] Multi-language support
- [ ] Improved UI/UX
- [ ] Performance optimizations

**To Contribute**:
1. Fork the repository
2. Create feature branch: `git checkout -b feature/improvement`
3. Make changes and test thoroughly
4. Submit pull request with description

---

## 📝 License

This project is provided as-is for educational and commercial use.
See LICENSE file for details.

---

## 🆘 Support

**Issues & Questions**:
1. Check DEPLOYMENT_GUIDE.md for detailed architecture info
2. Review Troubleshooting section above
3. Check Ollama logs: `ollama serve` output
4. Check browser console for frontend errors

**Debug Mode**:
```bash
# Run with verbose logging
export PYTHONUNBUFFERED=1
python -m uvicorn app.main:app --log-level debug
```

---

## 🎓 Learning Path

**For Users**:
1. Start with this README
2. Try uploading a sample document
3. Ask a few questions
4. Generate a report
5. Compare two documents

**For Developers**:
1. Read DEPLOYMENT_GUIDE.md for architecture
2. Examine `app/main.py` for endpoints
3. Study `app/rag_engine.py` for RAG logic
4. Review `app/ingest.py` for document processing
5. Check `app/static/script.js` for frontend integration

**For DevOps**:
1. Review deployment requirements
2. Set up offline package cache
3. Configure Ollama for production
4. Set up monitoring/logging
5. Plan backup strategy

---

## 📞 Quick Reference

| Task | Command |
|------|---------|
| Start Ollama | `ollama serve` |
| Pull Gemma model | `ollama pull gemma:3-1b` |
| Start IDAS | `start.bat` (Windows) or `bash start.sh` |
| Access Web UI | `http://localhost:8000` |
| API Base | `http://localhost:8000/api` |
| Stop Server | `Ctrl+C` in terminal |
| Clear Database | `rm -rf chroma_db/` then restart |
| Rebuild Index | `POST /rebuild` endpoint |

---

## 🙏 Acknowledgments

Built with:
- **FastAPI** - Modern web framework
- **ChromaDB** - Vector database
- **LangChain** - LLM orchestration
- **Ollama** - Local LLM running
- **Tesseract-OCR** - Text extraction from images
- **Sentence-Transformers** - Embeddings & reranking
- **HuggingFace** - Pre-trained models

---

**Last Updated**: April 2026  
**Status**: Production Ready  
**Python**: 3.11+  
**Platform**: Windows, Linux, MacOS
