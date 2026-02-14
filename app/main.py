from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import shutil
import os 
import threading 
import webbrowser 

from rag_engine import load_rag, ask_question, delete_document_by_source
from ingest import ingest_pdf

app = FastAPI()

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

llm, db = load_rag()

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/ask")
async def ask(request: Request):
    try:     
        data = await request.json()
        question = data.get("question")

        if not question:
            return {"answer": "No question provided."}
    
        answer = ask_question(question, llm, db)
        return {"answer": answer}
    
    except Exception as e:
        return {"answer": f"Error: {str(e)}"}

@app.post("/upload")
async def upload(files: list[UploadFile] = File(...)):
    for file in files: 
        file_path = os.path.join(UPLOAD_FOLDER, file.filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        ingest_pdf(file_path, db)
    
    return {"message": "File uploaded and ingested successfully."}

@app.post("/delete")
async def delete_file(request: Request):
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
    

def open_browser():
    webbrowser.open("http://localhost:8000")

if __name__ == "__main__":
    threading.Timer(1.5, open_browser).start()
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)