from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import shutil
import os
import threading
import webbrowser
import requests as _requests

from rag_engine import load_rag, ask_question, delete_document_by_source, generate_full_report
from ingest import ingest_pdf

OLLAMA_ERROR = (
    "Ollama is not running. Please start Ollama (run 'ollama serve' in a terminal) "
    "and try again."
)

app = FastAPI()

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

llm = None 
db = None 

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    files = os.listdir("uploads")
    return templates.TemplateResponse("index.html", {"request": request, "files": files})

@app.post("/ask")
async def ask(request: Request):
    llm, db = get_rag()

    data = await request.json()
    question = data.get("question")

    if not question:
        return {
            "answer": "No question provided.",
            "sources": [], "confidence": 0.0, "query_type": "general",
            "verified": False, "flags": [], "warning": None,
            "chunks_retrieved": 0, "chunks_reranked": 0,
        }

    try:
        result = ask_question(question, llm, db)
    except _requests.exceptions.ConnectionError:
        return {
            "answer": OLLAMA_ERROR,
            "sources": [], "confidence": 0.0, "query_type": "general",
            "verified": False, "flags": ["ollama_offline"], "warning": OLLAMA_ERROR,
            "chunks_retrieved": 0, "chunks_reranked": 0,
        }
    except Exception as e:
        return {
            "answer": f"Error: {str(e)}",
            "sources": [], "confidence": 0.0, "query_type": "general",
            "verified": False, "flags": ["error"], "warning": str(e),
            "chunks_retrieved": 0, "chunks_reranked": 0,
        }

    return {
        "answer":           result.answer,
        "sources":          result.sources,
        "confidence":       result.confidence,
        "query_type":       result.query_type,
        "verified":         result.verified,
        "flags":            result.flags,
        "warning":          result.warning,
        "chunks_retrieved": result.chunks_retrieved,
        "chunks_reranked":  result.chunks_reranked,
    }

@app.post("/generate-report")
async def generate_report(request: Request):
    llm, db = get_rag()

    data = await request.json()
    selected_files = data.get("files", [])

    try:
        report = generate_full_report(llm, db, selected_files)
    except _requests.exceptions.ConnectionError:
        return {"report": OLLAMA_ERROR}
    except Exception as e:
        return {"report": f"Error: {str(e)}"}

    return {"report": report}

@app.get("/files")
async def list_files():
    files = os.listdir("uploads")
    return {"files": files}

@app.post("/upload")
async def upload(files: list[UploadFile] = File(...)):
    llm, db = get_rag()

    for file in files: 
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        ingest_pdf(file_path, db)
    
    return {"message": "File uploaded and ingested successfully."}

@app.post("/delete")
async def delete_file(request: Request):

    llm, db = get_rag()

    data = await request.json()
    filename = data.get("filename")

    if not filename:
        return {"message": "No filename provided."}

    file_path = os.path.join("uploads", filename)

    delete_document_by_source(filename, db)

    if os.path.exists(file_path):
        os.remove(file_path)

    print("Deleting file:", filename)

    return {"message": f"File {filename} removed from database and uploads folder."}


@app.post("/rebuild")
async def rebuild_index():
    """
    Re-ingest every PDF in the uploads folder using the current chunk settings.
    Call this once after changing CHUNK_SIZE / CHUNK_OVERLAP in ingest.py so
    existing files get re-indexed with the improved strategy.
    """
    _, db = get_rag()

    pdf_files = [f for f in os.listdir(UPLOAD_FOLDER) if f.lower().endswith(".pdf")]

    if not pdf_files:
        return {"message": "No PDF files found in uploads folder.", "rebuilt": []}

    rebuilt = []
    for filename in pdf_files:
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        # Remove old chunks for this file, then re-ingest with new settings
        delete_document_by_source(filename, db)
        count = ingest_pdf(file_path, db)
        rebuilt.append({"file": filename, "chunks": count})
        print(f"[Rebuild] {filename}: {count} chunks")

    return {"message": f"Rebuilt index for {len(rebuilt)} file(s).", "rebuilt": rebuilt}
    

def open_browser():
    webbrowser.open("http://localhost:8000")

def get_rag():
    global llm, db
    if llm is None or db is None:
        llm, db = load_rag()
    return llm, db

if __name__ == "__main__":
    threading.Timer(1.5, open_browser).start()
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)