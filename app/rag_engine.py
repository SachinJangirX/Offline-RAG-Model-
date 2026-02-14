from langchain_community.llms import Ollama
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
import os 

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "..", "chroma_db")


def load_rag():
    embeddings = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2",
        model_kwargs={
            "local_files_only": True,
            "device": "cpu"
        },
        encode_kwargs={"normalize_embeddings": False},
    )

    db = Chroma(
        persist_directory=DB_PATH,
        embedding_function=embeddings,
    )

    llm = Ollama(model="llama3.2:1b")

    return llm, db

def ask_question(question, llm, db):

    docs = db.similarity_search(question, k=5)

    if not docs:
        return "No relevant information found in the database."
    
    context = "\n\n".join([doc.page_content for doc in docs])

    sources = list(set([doc.metadata.get("source", "unknown") for doc in docs]))

    prompt= f"""
Use the following context to answer the question.

Context: {context}

Question: {question}

Answer: 
"""
    
    response = llm.invoke(prompt)

    return response + f"\n\nSources: {sources}"


def delete_document_by_source(filename, db):
    db.delete(where={"source": filename})