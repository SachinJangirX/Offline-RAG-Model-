from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import os

def ingest_pdf(file_path, db):
    loader = PyPDFLoader(file_path)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(docs)


    # adding the metadata for the multiple doc setup 
    for chunk in chunks: 
        chunk.metadata["source"] = os.path.basename(file_path)
    
    db.add_documents(chunks)