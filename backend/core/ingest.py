"""Ingestion pipeline: inbox watcher + queue worker.

Flow per item: extract text (STT/OCR/PDF) -> LLM classify + notes -> store
chunks in SQLite + LanceDB.
"""
import shutil
import subprocess
import tempfile
import threading
import time
import traceback
from pathlib import Path

from core import db, llm, vectorstore
from core.config import FILES_DIR, INBOX_DIR, kind_of

CHUNK_CHARS = 900
NOTES_INPUT_CHARS = 5000
# Apple Vision reports quantized confidences (1.0 printed, ~0.3-0.5 handwriting)
HANDWRITING_CONF_THRESHOLD = 0.8

CLASSIFY_SYSTEM = (
    "You organize study material for a student. Given content from a lecture or "
    "document, return JSON: {\"subject\": <short subject/course name>, "
    "\"title\": <short descriptive title>}. Reuse one of the existing subjects "
    "when it fits; otherwise invent a concise new one."
)

NOTES_SYSTEM = (
    "You write clear, hierarchical study notes in markdown for a student. "
    "Use headings, bullet points, and bold key terms. Capture definitions, "
    "formulas and concepts faithfully. Keep the source references like "
    "[@ mm:ss] or [p. N] that appear in the text next to the points they support. "
    "Output only the markdown notes."
)


def _ffmpeg_to_wav(src: str) -> str:
    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-ac", "1", "-ar", "16000", "-vn", out],
        check=True, capture_output=True,
    )
    return out


def _mmss(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _extract(item: dict) -> list[dict]:
    """Returns chunk dicts: {text, ts_start, page, image_path} with source refs inline."""
    path = item["stored_path"]
    kind = item["kind"]

    if kind in ("audio", "video"):
        from core.stt import transcribe
        wav = _ffmpeg_to_wav(path)
        try:
            segments = transcribe(wav)
        finally:
            Path(wav).unlink(missing_ok=True)
        chunks, buf, buf_start = [], "", None
        for seg in segments:
            if buf_start is None:
                buf_start = seg["start"]
            buf += f" {seg['text']}"
            if len(buf) >= CHUNK_CHARS:
                chunks.append({"text": f"[@ {_mmss(buf_start)}]{buf}", "ts_start": buf_start})
                buf, buf_start = "", None
        if buf.strip():
            chunks.append({"text": f"[@ {_mmss(buf_start)}]{buf}", "ts_start": buf_start})
        if kind == "video":
            try:
                from core.video import capture_stable_frames
                capture_stable_frames(item["id"], path)
            except Exception:
                traceback.print_exc()  # transcript remains useful even if board capture fails
        return chunks

    if kind == "pdf":
        from core.ocr import extract_pdf
        return [
            {"text": f"[p. {p['page']}] {chunk}", "page": p["page"]}
            for p in extract_pdf(path)
            for chunk in _split(p["text"])
        ]

    if kind == "image":
        from core.ocr import ocr_image_annotations
        try:
            annotations = ocr_image_annotations(path)
        except Exception:
            annotations = []
        text = "\n".join(a[0] for a in annotations).strip()
        confidence = sum(a[1] for a in annotations) / len(annotations) if annotations else 0.0
        # Low Vision confidence (or nothing found) usually means handwriting:
        # run the personalized TrOCR pipeline instead. The page also lands in
        # the Handwriting tab where lines can be corrected (and train the model).
        if confidence < HANDWRITING_CONF_THRESHOLD:
            try:
                from core.handwriting import recognize_item_page
                hw_text = recognize_item_page(item["id"], path)
                if hw_text:
                    text = hw_text
            except Exception:
                traceback.print_exc()  # fall back to whatever Vision found
        if not text:
            return []
        return [{"text": text, "image_path": path}]

    if kind == "text":
        raw = Path(path).read_text(errors="ignore")
        return [{"text": t} for t in _split(raw)]

    return []


def _split(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    parts, buf = [], ""
    for para in text.split("\n\n"):
        if len(buf) + len(para) > CHUNK_CHARS and buf:
            parts.append(buf.strip())
            buf = ""
        buf += para + "\n\n"
    if buf.strip():
        parts.append(buf.strip())
    return parts


def _classify(full_text: str) -> tuple[str, str]:
    existing = ", ".join(s["name"] for s in db.list_subjects()) or "(none yet)"
    result = llm.chat_json(
        CLASSIFY_SYSTEM,
        f"Existing subjects: {existing}\n\nContent:\n{full_text[:4000]}",
    )
    return str(result.get("subject", "General")), str(result.get("title", "Untitled"))


def _generate_notes(full_text: str) -> str:
    sections = []
    for i in range(0, len(full_text), NOTES_INPUT_CHARS):
        part = full_text[i:i + NOTES_INPUT_CHARS]
        sections.append(llm.chat(NOTES_SYSTEM, part, max_tokens=1500))
    return "\n\n".join(sections)


def process_item(item: dict):
    db.set_status(item["id"], "processing")
    chunks = _extract(item)
    if not chunks:
        raise ValueError("no text could be extracted from this file")

    full_text = "\n\n".join(c["text"] for c in chunks)
    subject_name, title = _classify(full_text)
    subject_id = db.get_or_create_subject(subject_name)
    db.set_item_meta(item["id"], title, subject_id)

    notes_md = _generate_notes(full_text)
    db.add_note(item["id"], notes_md)

    source = f"{title} ({item['filename']})"
    rows = []
    for c in chunks:
        chunk_id = db.add_chunk(
            item["id"], c["text"], source,
            ts_start=c.get("ts_start"), page=c.get("page"), image_path=c.get("image_path"),
        )
        rows.append({
            "chunk_id": chunk_id, "item_id": item["id"], "subject": subject_name,
            "source_label": source, "text": c["text"], "ts_start": c.get("ts_start"),
            "page": c.get("page"), "image_path": c.get("image_path"),
        })
    # index note sections too, so answers can draw on the synthesized notes
    for section in _split(notes_md):
        chunk_id = db.add_chunk(item["id"], section, source + " — notes")
        rows.append({
            "chunk_id": chunk_id, "item_id": item["id"], "subject": subject_name,
            "source_label": source + " — notes", "text": section,
        })
    vectorstore.add_chunks(rows)
    db.set_status(item["id"], "done")


def enqueue_file(src: Path) -> int | None:
    kind = kind_of(src)
    if kind is None:
        return None
    dest = FILES_DIR / f"{int(time.time()*1000)}_{src.name}"
    shutil.copy2(src, dest)
    return db.add_item(src.name, str(dest), kind)


def _sweep_inbox():
    for f in sorted(INBOX_DIR.iterdir()):
        if f.is_file() and not f.name.startswith("."):
            # skip files still being written (e.g. an in-progress recording)
            size = f.stat().st_size
            time.sleep(0.5)
            if f.stat().st_size != size:
                continue
            if enqueue_file(f) is not None:
                f.unlink()


def worker_loop(stop: threading.Event | None = None):
    db.init_db()
    while stop is None or not stop.is_set():
        try:
            _sweep_inbox()
            item = db.next_pending_item()
            if item is None:
                time.sleep(2)
                continue
            if not llm.is_available():
                time.sleep(5)  # wait for LM Studio; keep the item queued
                continue
            try:
                process_item(item)
            except Exception as e:
                traceback.print_exc()
                db.set_status(item["id"], "error", str(e)[:500])
        except Exception:
            traceback.print_exc()
            time.sleep(5)


def start_worker() -> threading.Thread:
    t = threading.Thread(target=worker_loop, daemon=True, name="ingest-worker")
    t.start()
    return t
