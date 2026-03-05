from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
import math
import os
import re

from langchain_community.llms import Ollama
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

# ── Paths & constants ──────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DB_PATH     = os.path.join(BASE_DIR, "..", "chroma_db")
LLM_MODEL   = "llama3.2:1b"
TEMPERATURE = 0.0

# ── Embedding model ────────────────────────────────────────────────────────────
EMBED_MODEL      = "BAAI/bge-small-en-v1.5"
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

# ── Cross-encoder model ────────────────────────────────────────────────────────
CE_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# Retrieval hyper-parameters
VEC_K         = 20      # candidates from vector store before reranking
VEC_THRESHOLD = 0.70    # cosine-distance cut-off (lower = more similar)
RERANK_TOP_K  = 5       # chunks passed to LLM after cross-encoder reranking

# Verification thresholds
MIN_ANSWER_WORDS  = 8
MIN_OVERLAP_WORDS = 5   


# ── Data structures ────────────────────────────────────────────────────────────

@dataclass
class VerificationResult:
    verified: bool
    flags: list[str] = field(default_factory=list)


@dataclass
class RAGResponse:
    answer: str
    sources: list[str]
    confidence: float
    query_type: str
    verified: bool
    flags: list[str]
    warning: Optional[str]
    chunks_retrieved: int
    chunks_reranked: int


# ── Embedding wrapper ──────────────────────────────────────────────────────────

class BGEEmbeddings(HuggingFaceEmbeddings):
    """
    Thin wrapper that prepends the BGE retrieval instruction to every query.
    Documents are embedded without the prefix — this asymmetry is how BGE
    models reach their full retrieval quality.
    """
    def embed_query(self, text: str) -> list[float]:
        return super().embed_query(BGE_QUERY_PREFIX + text)


# ── Cross-encoder singleton ────────────────────────────────────────────────────

_CE_MODEL = None

def _get_cross_encoder():
    """Lazy-load the cross-encoder once; return None if unavailable."""
    global _CE_MODEL
    if _CE_MODEL is not None:
        return _CE_MODEL
    try:
        from sentence_transformers import CrossEncoder
        _CE_MODEL = CrossEncoder(CE_MODEL_NAME, max_length=512)
        print(f"[CrossEncoder] Loaded {CE_MODEL_NAME}")
    except Exception as e:
        print(f"[CrossEncoder] Not available ({e}). Falling back to vector scores only.")
        _CE_MODEL = None
    return _CE_MODEL


# ── RAG loader ─────────────────────────────────────────────────────────────────

def load_rag():
    embeddings = BGEEmbeddings(
        model_name=EMBED_MODEL,
        model_kwargs={
            "local_files_only": True,
            "device": "cpu",
        },
        encode_kwargs={"normalize_embeddings": True},
    )
    db  = Chroma(persist_directory=DB_PATH, embedding_function=embeddings)
    llm = Ollama(model=LLM_MODEL, temperature=TEMPERATURE)
    return llm, db


# ── Stage 1: Query classifier ──────────────────────────────────────────────────

def _classify_query(question: str) -> str:
    """
    Regex-based intent classification — zero LLM calls.
    Returns one of: comparison | definition | procedural | list | factual | general
    """
    q = question.lower()

    comparison_re = re.compile(
        r'\b(compare|comparison|vs\.?|versus|difference|differ|contrast|'
        r'better|worse|advantage|disadvantage|pros?\b|cons?\b)\b'
    )
    definition_re = re.compile(
        r'\b(what is|what are|define|definition|meaning of|explain|describe)\b'
    )
    procedural_re = re.compile(
        r'\b(how to|how do|how does|steps?|procedure|process|method|algorithm|workflow)\b'
    )
    list_re = re.compile(
        r'\b(list|enumerate|give me|name all|what are the|types? of|kinds? of|examples? of)\b'
    )
    factual_re = re.compile(
        r'\b(when|where|who|which|value|number|amount|size|weight|speed|'
        r'voltage|current|frequency|temperature|pressure|dimension)\b'
    )

    if comparison_re.search(q):
        return "comparison"
    if definition_re.search(q):
        return "definition"
    if procedural_re.search(q):
        return "procedural"
    if list_re.search(q):
        return "list"
    if factual_re.search(q):
        return "factual"
    return "general"


# ── Stage 2: Metadata filter builder ──────────────────────────────────────────

def _build_metadata_filter(question: str) -> Optional[dict]:
    """
    If the question mentions one or more explicit .pdf filenames,
    restrict retrieval to those files only.
    Returns a Chroma-compatible 'where' dict or None.
    """
    pdf_names = re.findall(r'\b[\w\- ]+\.pdf\b', question, flags=re.IGNORECASE)
    pdf_names = [p.strip() for p in pdf_names]

    if not pdf_names:
        return None
    if len(pdf_names) == 1:
        return {"source": pdf_names[0]}
    return {"source": {"$in": pdf_names}}


# ── Stage 3: Vector retrieval ──────────────────────────────────────────────────

def _vector_retrieve(question: str, db, where_filter: Optional[dict]):
    """
    Retrieve up to VEC_K candidates from ChromaDB.
    Applies distance threshold; falls back to top-3 if all scores exceed it.
    Returns list of (doc, vec_score).
    """
    kwargs = {"k": VEC_K}
    if where_filter:
        kwargs["filter"] = where_filter

    results = db.similarity_search_with_score(question, **kwargs)

    if not results:
        return []

    scored = [(doc, score) for doc, score in results if score < VEC_THRESHOLD]

    if not scored:
        # Guaranteed fallback — at least top-3 reach the LLM
        scored = sorted(results, key=lambda x: x[1])[:3]
        min_s  = min(s for _, s in results)
        max_s  = max(s for _, s in results)
        print(
            f"[Warning] All {len(results)} vector scores exceeded threshold "
            f"({min_s:.3f} – {max_s:.3f}). Using top-3 fallback."
        )

    for doc, score in scored:
        print(
            f"  VecScore: {score:.4f}  "
            f"Source: {doc.metadata.get('source')}  "
            f"Page: {doc.metadata.get('page')}  "
            f"Seq: {doc.metadata.get('chunk_seq')}"
        )

    return scored  # list of (doc, vec_score)


# ── Stage 4: Cross-encoder reranking ──────────────────────────────────────────

def _cross_encoder_rerank(question: str, candidates: list) -> list:
    """
    Rerank (doc, vec_score) pairs with cross-encoder.
    Returns top-RERANK_TOP_K list of (doc, vec_score, ce_score), best first.
    Falls back to vec_score ordering when cross-encoder unavailable.
    """
    ce = _get_cross_encoder()

    if ce is None or not candidates:
        # No cross-encoder — sort by ascending vector distance, keep top-K
        top = sorted(candidates, key=lambda x: x[1])[:RERANK_TOP_K]
        return [(doc, vec_score, -vec_score) for doc, vec_score in top]

    pairs  = [(question, doc.page_content) for doc, _ in candidates]
    scores = ce.predict(pairs)    # numpy array of logits

    triples = [
        (doc, vec_score, float(ce_score))
        for (doc, vec_score), ce_score in zip(candidates, scores)
    ]
    triples.sort(key=lambda x: x[2], reverse=True)   # highest CE score first

    for doc, vs, cs in triples[:RERANK_TOP_K]:
        print(
            f"  CE: {cs:+.3f}  Vec: {vs:.4f}  "
            f"Page: {doc.metadata.get('page')}  "
            f"Seq: {doc.metadata.get('chunk_seq')}"
        )

    return triples[:RERANK_TOP_K]


# ── Stage 5: Context builder ───────────────────────────────────────────────────

def _build_context(reranked: list) -> tuple[str, list[str]]:
    """
    Re-sort reranked chunks into document reading order (page, chunk_seq)
    and assemble labeled context string.
    Returns (context_string, sorted_sources_list).
    """
    reranked_sorted = sorted(
        reranked,
        key=lambda x: (
            x[0].metadata.get("page",      0),
            x[0].metadata.get("chunk_seq", 0),
        ),
    )

    labeled_chunks = [
        f"[{doc.metadata.get('source', 'unknown')} | page {doc.metadata.get('page', '?')}]\n"
        f"{doc.page_content}"
        for doc, _, _ in reranked_sorted
    ]

    context = "\n\n".join(labeled_chunks)
    sources  = sorted(set(doc.metadata.get("source", "unknown") for doc, _, _ in reranked_sorted))
    return context, sources


# ── Stage 6: Prompt builder ────────────────────────────────────────────────────

_PROMPT_SUFFIX = (
    "\n\nIf the context does not contain the answer, respond exactly:\n"
    "  \"No relevant information found in the provided documents.\"\n\n"
    "Do NOT introduce external knowledge. Quote or paraphrase the context directly.\n\n"
    "Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"
)

_PROMPT_TEMPLATES = {
    "comparison": (
        "You are a precise technical assistant.\n"
        "The question asks for a comparison. "
        "Present your answer as a Markdown table where possible.\n"
        "Use ONLY the context provided."
        + _PROMPT_SUFFIX
    ),
    "definition": (
        "You are a precise technical assistant.\n"
        "The question asks for a definition or explanation. "
        "Give a clear, concise definition using ONLY the context."
        + _PROMPT_SUFFIX
    ),
    "procedural": (
        "You are a precise technical assistant.\n"
        "The question asks about a process or procedure. "
        "Present your answer as a numbered step-by-step list using ONLY the context."
        + _PROMPT_SUFFIX
    ),
    "list": (
        "You are a precise technical assistant.\n"
        "The question asks for a list. "
        "Present your answer as a bullet list using ONLY the context."
        + _PROMPT_SUFFIX
    ),
    "factual": (
        "You are a precise technical assistant.\n"
        "The question asks for a specific fact, number, or value. "
        "Be exact — include the precise value and its unit if present. "
        "Use ONLY the context."
        + _PROMPT_SUFFIX
    ),
    "general": (
        "You are a precise technical assistant.\n"
        "Answer the question using ONLY the context below."
        + _PROMPT_SUFFIX
    ),
}


def _build_prompt(question: str, context: str, query_type: str) -> str:
    template = _PROMPT_TEMPLATES.get(query_type, _PROMPT_TEMPLATES["general"])
    return template.format(context=context, question=question)


# ── Stage 7: Verification layer ────────────────────────────────────────────────

_HEDGE_PHRASES = [
    "i don't know", "i do not know", "i'm not sure", "i am not sure",
    "cannot determine", "not mentioned", "not stated", "not specified",
    "no information", "not available", "not provided", "not found",
    "no relevant information found",
]


def _verify(answer: str, context: str) -> VerificationResult:
    """
    Rule-based verification — zero extra LLM calls.
    Checks: hedge phrases, no_answer detection, too-short answers,
            and word-overlap between answer and context.
    """
    flags: list[str] = []
    a_lower = answer.lower()

    # Check for explicit no-answer response
    if "no relevant information found" in a_lower:
        return VerificationResult(verified=False, flags=["no_answer"])

    # Check for hedge phrases that signal low confidence
    for phrase in _HEDGE_PHRASES:
        if phrase in a_lower:
            flags.append("hedged")
            break

    # Too short — LLM may have declined or produced nothing useful
    word_count = len(answer.split())
    if word_count < MIN_ANSWER_WORDS:
        flags.append("too_short")

    # Word-overlap check — answer should share vocabulary with context
    answer_words  = set(re.findall(r'\b[a-z]{3,}\b', a_lower))
    context_words = set(re.findall(r'\b[a-z]{3,}\b', context.lower()))
    overlap = len(answer_words & context_words)
    if overlap < MIN_OVERLAP_WORDS:
        flags.append("low_overlap")

    verified = len(flags) == 0
    return VerificationResult(verified=verified, flags=flags)


# ── Stage 8: Confidence scoring ───────────────────────────────────────────────

def _score_confidence(
    reranked: list,
    verification: VerificationResult,
) -> float:
    """
    Confidence = 0.65 * sigmoid(best_ce_score / 3) + 0.35 * (1 - best_vec_score)
    minus 0.15 per verification flag (floor 0.0, ceiling 1.0).

    When cross-encoder is unavailable, ce_score is set to -vec_score so the
    formula degrades gracefully to a vec-distance–only score.
    """
    if not reranked:
        return 0.0

    best_ce  = max(cs for _, _, cs in reranked)
    best_vec = min(vs for _, vs, _ in reranked)

    sigmoid_ce  = 1.0 / (1.0 + math.exp(-best_ce / 3.0))
    vec_contrib = max(0.0, 1.0 - best_vec)

    raw = 0.65 * sigmoid_ce + 0.35 * vec_contrib

    penalty = 0.15 * len(verification.flags)
    score   = max(0.0, min(1.0, raw - penalty))
    return round(score, 3)


# ── Main entry-point: ask_question ────────────────────────────────────────────

def ask_question(question: str, llm, db) -> RAGResponse:
    """
    Full 8-stage RAG pipeline:
      1 classify query
      2 build metadata filter
      3 vector retrieval
      4 cross-encoder reranking
      5 context builder
      6 prompt builder
      7 LLM call
      8 verification + confidence scoring
    """
    # Stage 1
    query_type = _classify_query(question)
    print(f"[Pipeline] query_type={query_type!r}")

    # Stage 2
    where_filter = _build_metadata_filter(question)
    if where_filter:
        print(f"[Pipeline] metadata filter: {where_filter}")

    # Stage 3
    candidates = _vector_retrieve(question, db, where_filter)
    if not candidates:
        return RAGResponse(
            answer="No documents in the database. Please upload and ingest a PDF first.",
            sources=[],
            confidence=0.0,
            query_type=query_type,
            verified=False,
            flags=["no_documents"],
            warning="The document database is empty.",
            chunks_retrieved=0,
            chunks_reranked=0,
        )

    # Stage 4
    reranked = _cross_encoder_rerank(question, candidates)

    # Stage 5
    context, sources = _build_context(reranked)

    # Stage 6
    prompt = _build_prompt(question, context, query_type)

    # Stage 7 — LLM call
    response = llm.invoke(prompt)
    answer   = response.strip()

    # Stage 8
    verification = _verify(answer, context)
    confidence   = _score_confidence(reranked, verification)

    # Build warning string if needed
    warning: Optional[str] = None
    flag_messages = {
        "no_answer":    "The model found no relevant information in the documents.",
        "hedged":       "The model expressed uncertainty — verify this answer manually.",
        "too_short":    "The answer is unusually short; the model may have insufficient context.",
        "low_overlap":  "Low vocabulary overlap between answer and source — possible hallucination risk.",
    }
    if verification.flags:
        warning = " ".join(flag_messages[f] for f in verification.flags if f in flag_messages)

    print(
        f"[Pipeline] confidence={confidence:.3f}  verified={verification.verified}  "
        f"flags={verification.flags}  sources={sources}"
    )

    return RAGResponse(
        answer=answer,
        sources=sources,
        confidence=confidence,
        query_type=query_type,
        verified=verification.verified,
        flags=verification.flags,
        warning=warning,
        chunks_retrieved=len(candidates),
        chunks_reranked=len(reranked),
    )


# ── Utility functions (unchanged interface) ───────────────────────────────────

def delete_document_by_source(filename: str, db) -> None:
    db.delete(where={"source": filename})


def generate_full_report(llm, db, filenames=None):

    # Guard: reject empty filename list
    if filenames is not None and len(filenames) == 0:
        return (
            "No files specified. Type filenames separated by **+** in the input box "
            "and click **Generate Report**.\n\nExample: `component_A.pdf + datasheet_B.pdf`"
        )

    # Strict filtering
    if filenames:
        if len(filenames) == 1:
            db_filter = {"source": filenames[0]}
        else:
            db_filter = {"source": {"$in": filenames}}

        results = db.get(where=db_filter, limit=60)

    else:
        results = db.get(limit=60)

    documents = results.get("documents", [])
    metadatas = results.get("metadatas", []) or [{}] * len(documents)

    if not documents:
        missing = ", ".join(filenames) if filenames else "any files"
        return (
            f"No chunks found for: **{missing}**.\n\n"
            "Possible causes:\n"
            "- The filename does not match exactly.\n"
            "- The file has not been ingested yet.\n"
            "- Rebuild the index."
        )

    # Sort chunks
    pairs = list(zip(documents, metadatas))
    pairs.sort(key=lambda x: (
        (x[1] or {}).get("source", ""),
        (x[1] or {}).get("page", 0),
        (x[1] or {}).get("chunk_seq", 0),
    ))

    labeled_chunks = [
        f"[{(m or {}).get('source','unknown')} | page {(m or {}).get('page','?')}]\n{doc}"
        for doc, m in pairs
    ]

    combined = "\n\n---\n\n".join(labeled_chunks)

    print(f"[Report] Total chars: {len(combined)}")

    # SAFE segment sizes for llama3.2:1b
    SEGMENT_SIZE = 4000
    OVERLAP = 200

    if len(combined) <= SEGMENT_SIZE:
        segments = [combined]
    else:
        segments = []
        start = 0

        while start < len(combined):
            end = min(start + SEGMENT_SIZE, len(combined))
            segments.append(combined[start:end])

            if end >= len(combined):
                break

            start = end - OVERLAP

    print(f"[Report] Split into {len(segments)} segments")

    all_facts = []

    # PASS 1: fact extraction
    for idx, seg in enumerate(segments, 1):

        print(f"[Report] Extracting segment {idx}/{len(segments)}")

        prompt = f"""
You are a precision data extraction engine.

Extract ALL factual information from the document.

Return bullet lists only.

Document segment:
{seg}
"""

        try:
            facts = llm.invoke(prompt)
        except Exception as e:
            print(f"[ERROR] LLM failed: {e}")
            facts = "Extraction failed for this segment."

        all_facts.append(f"Segment {idx}\n{facts}")

    # Prevent huge prompts
    MAX_SEGMENTS_FOR_REPORT = 5
    combined_facts = "\n\n".join(all_facts[:MAX_SEGMENTS_FOR_REPORT])

    print("[Report] Writing final report")

    report_prompt = f"""
Write a structured technical report using ONLY the facts below.

Use Markdown sections.

Sections:
1. Executive Summary
2. Definitions
3. Key Concepts
4. Technical Specifications
5. Numerical Data
6. Processes
7. Governing Principles
8. Comparative Analysis
9. Applications
10. Conclusion

FACTS:
{combined_facts}

Write the report now.
"""

    try:
        report = llm.invoke(report_prompt)
    except Exception as e:
        print(f"[ERROR] Final report generation failed: {e}")
        report = "Report generation failed."

    print("[Report] Done")

    return report
