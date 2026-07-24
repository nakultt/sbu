"""Ask My Notes: retrieve chunks from LanceDB and answer with citations."""
from core import llm, vectorstore

ANSWER_SYSTEM = (
    "You are a study assistant answering strictly from the student's own notes below. "
    "Cite sources inline using the bracketed labels provided, e.g. "
    "[source: Lecture 3 @ 12:34] or [source: Slides p. 5]. "
    "If the notes don't contain the answer, say so plainly."
)


def _mmss(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def ask(question: str, subject: str | None = None, k: int = 8) -> dict:
    hits = vectorstore.search(question, subject=subject, k=k)
    if not hits:
        return {"answer": "No notes found yet — ingest some material first.",
                "sources": [], "images": []}

    context_blocks = []
    for h in hits:
        label = h["source_label"]
        if h.get("ts_start") is not None:
            label += f" @ {_mmss(h['ts_start'])}"
        elif h.get("page"):
            label += f" p. {h['page']}"
        context_blocks.append(f"[source: {label}]\n{h['text']}")

    answer = llm.chat(
        ANSWER_SYSTEM,
        f"Notes:\n\n" + "\n\n---\n\n".join(context_blocks) + f"\n\nQuestion: {question}",
        max_tokens=1200,
    )
    images = [h["image_path"] for h in hits if h.get("image_path")]
    sources = list(dict.fromkeys(
        b.split("\n", 1)[0].removeprefix("[source: ").removesuffix("]")
        for b in context_blocks
    ))
    return {"answer": answer, "sources": sources, "images": images}
