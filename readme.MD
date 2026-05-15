# Intelligent Document Analysis System (IDAS)

IDAS is an offline document intelligence platform developed for deployment at the Army Design Bureau (ADB), Sena Bhawan. The system enables question-answering, report generation, and comparative analysis of documents in air-gapped environments using local language models.

The system combines PDF processing, vector search, and local language model inference to provide document analysis capabilities without requiring internet connectivity or cloud services. It processes both text-based and scanned PDFs with OCR capabilities and operates in restricted environments where data security and offline functionality are required.

## Capabilities

- Question-answering against document collections
- Report generation from single or multiple documents
- Comparative analysis across documents
- Offline operation with no external dependencies
- Support for scanned PDFs with OCR
- Multi-document analysis with retrieval and reranking
- Local inference using Gemma 1B language model

## Technical Architecture

The system consists of three main components:

**Ingest Pipeline** - Handles PDF loading, text extraction, OCR for scanned documents, text normalization, and semantic chunking for optimal retrieval.

**RAG Engine** - Manages vector similarity search using semantic embeddings, cross-encoder reranking for improved relevance, query verification, and local LLM inference for answer generation.

**Vector Database** - ChromaDB instance for persistent storage of document embeddings and metadata with local file-based persistence.

The components integrate through a FastAPI server providing REST endpoints for document upload, query processing, report generation, and database management.

## Project Structure

```
IDAS/
├── README.md                    # This file
├── requirements.txt             # Python dependencies
├── start.bat                    # Windows launcher
├── app/
│   ├── main.py                  # FastAPI server and REST endpoints
│   ├── ingest.py                # PDF processing and OCR pipeline
│   ├── rag_engine.py            # RAG query engine and LLM integration
│   ├── static/
│   │   ├── script.js            # Frontend logic
│   │   └── style.css            # UI styling
│   └── templates/
│       └── index.html           # Web interface
├── chroma_db/                   # Vector database storage
└── uploads/                     # Temporary document storage
```

## Component Documentation

### FastAPI Application Server (app/main.py)

HTTP REST API server that handles client requests and coordinates between system components. Responsibilities include serving the web interface, managing PDF uploads, routing queries to the RAG engine, managing file operations, generating reports, and handling error conditions.

REST Endpoints:
- GET / - Load web interface
- POST /upload - Upload and ingest PDF files
- POST /ask - Submit questions
- GET /files - List uploaded files
- POST /delete - Remove files
- POST /generate-report - Generate report
- POST /generate-comparative-report - Compare documents
- POST /rebuild - Rebuild vector index
- GET /health - Health check

## Installation

Prerequisites: Python 3.11+, 6GB RAM minimum, Ollama with Gemma 1B model

1. Install Ollama from ollama.ai and run ollama serve
2. Pull the model: ollama pull gemma:1b
3. Create virtual environment: python -m venv venv
4. Activate: source venv/bin/activate (or venv\Scripts\activate on Windows)
5. Install dependencies: pip install -r requirements.txt
6. Run: start.bat (Windows) or bash start.sh (Linux/Mac)
7. Access: http://localhost:8000

## Operation

The web interface supports PDF upload, document querying, report generation, and comparative analysis. Document processing includes automatic type detection, OCR application for scanned content, text chunking, and embedding generation. Queries use semantic search with reranking to identify relevant passages and generate answers with source attribution and confidence scores.

## Components

Document Processing - PDF loading, text extraction, OCR for scanned documents, text normalization, and semantic chunking.

Retrieval Engine - Semantic embeddings with vector similarity search and cross-encoder reranking.

Language Model - Gemma 1B model via Ollama for response generation with verification and source attribution.

Vector Storage - ChromaDB for local, persistent storage of embeddings.

Web Interface - FastAPI REST API with HTML/CSS/JavaScript frontend.

## Features

- Offline operation with no cloud dependencies
- Support for text and scanned PDFs with OCR
- Multi-document comparative analysis
- Answer verification with confidence scoring
- Optimized for limited resources
- Web-based interface
- Error handling and recovery

## Deployment

Deployed at the Army Design Bureau (ADB), Sena Bhawan, for document analysis in restricted operational environments. Operates without external network connectivity for secure local processing of sensitive documents. Deployment considerations include file permission constraints, OCR configuration for document variability, and resource optimization.

The system processes sensitive documents without external transmission. All processing remains local. File permissions and access controls should be configured per organizational security policies.

## Troubleshooting

Ollama Connection Error - Ensure Ollama service is running. Start with "ollama serve" in a separate terminal and verify the Gemma model is pulled.

Slow Processing - Initial model loading takes time. Subsequent queries are faster. Reduce OCR_DPI or CHUNK_SIZE for faster processing on limited hardware.

Poor OCR Results - Increase OCR_DPI for better quality, ensure PDF has adequate contrast, and try with rotated/de-skewed documents.

Out of Memory - Reduce CHUNK_SIZE, lower OCR_DPI, or use a smaller language model variant.

Database Corruption - Delete the chroma_db directory and restart the application to rebuild the index.

## Performance Notes

Document upload processing: 30-40 seconds per 10MB. Query responses: 2-5 seconds depending on document size and system resources. Report generation: 10-30 seconds depending on complexity and document count.

The system requires 6GB RAM minimum. Performance scales better with SSDs than HDDs. GPU acceleration is not currently enabled.

## Technical Stack

FastAPI - Web framework and REST API layer
ChromaDB - Vector storage and semantic search
LangChain - RAG pipeline and LLM orchestration
Ollama - Local language model runner
Sentence-Transformers - Embeddings and reranking
Tesseract-OCR - Text extraction from scanned documents

## Dependencies

See requirements.txt for complete list. Primary external dependencies: Python 3.11+, Ollama (local), Gemma 1B language model, BAAI embedding model.
