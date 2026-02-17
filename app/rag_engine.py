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

    results = db.similarity_search_with_score(question, k=5)

    docs = []
    threshold = 1.2

    for doc, score in results:
        if score < threshold:
            docs.append(doc)
        print(f"Score: {score}, Source: {doc.metadata.get('source')}")

    if not docs:
        return "No relevant information found in the database."
    
    context = "\n\n".join([doc.page_content for doc in docs])

    sources = list(set([doc.metadata.get("source", "unknown") for doc in docs]))

    prompt= f"""
You are a technical assistant.

Use ONLY the provided context to answer the question.

-Base your answer strictly on the context.
-You may summarize or restate information found in the context 
-Do NOT introduce external knowledge 
-If no relevant information found in the context, respond:
 "No relevant information found in the database.
Provided Context: {context}

User Question: {question}

Answer: 
"""
    
    response = llm.invoke(prompt)

    return response + f"\n\nSources: {sources}"


def delete_document_by_source(filename, db):
    db.delete(where={"source": filename})