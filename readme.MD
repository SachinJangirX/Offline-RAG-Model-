# Intelligence Document Analysis System (IDAS)

Intelligence Document Analysis System (IDAS) is an offline document analysis platform developed during my internship work at the Army Design Bureau (ADB), Sena Bhawan.

The system was built to assist in analyzing large technical and intelligence-related documents in secure environments where cloud-based AI services cannot be used.

It supports semantic document search, contextual question answering, document comparison, and summarization while running completely on local infrastructure.

---

## Problem Statement

In secure environments, documents are usually stored in isolated systems without internet access. Searching information manually across lengthy reports and technical files becomes time consuming and inefficient.

The goal of this project was to develop a local document intelligence system capable of:
- extracting information from large documents
- understanding semantic meaning instead of keyword matching
- generating contextual responses
- comparing information across multiple files
- reducing manual analysis time

The complete pipeline was designed to work offline without external API dependency.

---

## Features

- Offline document processing
- Semantic search over documents
- Context-aware question answering
- Multi-document comparison
- Automatic summarization
- PDF and DOCX support
- Local vector database integration
- Retrieval-Augmented Generation (RAG) pipeline
- Streamlit-based user interface

---

## Tech Stack

### Backend
- Python
- LangChain

### Frontend
- Streamlit

### Vector Database
- FAISS / ChromaDB

### Embedding Models
- Sentence Transformers

### Document Processing
- PyPDF
- python-docx

---

## System Workflow

### 1. Document Upload
Documents are uploaded through the Streamlit interface.

### 2. Text Extraction
The system extracts raw text from uploaded files.

### 3. Text Chunking
Large documents are divided into smaller chunks for efficient retrieval.

### 4. Embedding Generation
Each chunk is converted into vector embeddings using local transformer models.

### 5. Vector Storage
Embeddings are stored in a local vector database.

### 6. Semantic Retrieval
Relevant document chunks are retrieved based on query similarity.

### 7. Response Generation
Retrieved context is used to generate final responses.

---

## Project Structure

```text
IDAS/
│
├── app.py
├── requirements.txt
├── data/
├── embeddings/
├── models/
├── utils/
├── vector_store/
└── README.md
'''text

Installation
Clone Repository
git clone https://github.com/SachinJangirX/Intelligence-Document-Analysis-System-IDAS.git

Move to Project Directory
cd Intelligence-Document-Analysis-System-IDAS

Install Dependencies
pip install -r requirements.txt

Run Application
streamlit run app.py

Security and Deployment Considerations

The system was designed specifically for restricted environments.

Key considerations during development:

no internet dependency
no cloud API usage
local embedding generation
local vector database storage
offline execution support
controlled document handling

The project was deployed internally during internship work at the Army Design Bureau (ADB).

Challenges Faced

Some challenges during development included:

handling large PDF files efficiently
reducing irrelevant retrieval results
selecting optimal chunk sizes
improving response quality for long documents
maintaining low query latency
ensuring complete offline compatibility
Learning Outcomes

Through this project, I gained practical experience in:

Retrieval-Augmented Generation (RAG)
semantic search systems
vector databases
local LLM workflows
document intelligence pipelines
secure AI deployment environments
debugging and optimization of NLP systems
Future Improvements

Possible future extensions:

OCR support for scanned documents
multilingual document analysis
role-based access control
citation tracking for generated responses
GPU acceleration for faster inference
support for additional file formats
Author

Sachin Jangir
B.Tech Engineering Physics
