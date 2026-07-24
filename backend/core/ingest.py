"""Ingestion pipeline: inbox watcher + queue worker.

Flow per item: extract text (STT/OCR/PDF) -> LLM classify + notes -> store
chunks in SQLite + LanceDB.
"""
import shutil
import re
import subprocess
import tempfile
import threading
import time
import traceback
from datetime import date, datetime
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
    "only when the material clearly belongs to it; otherwise invent a concise new one. "
    "Never put material into an unrelated existing subject."
)

NOTES_SYSTEM = (
    "You write accurate, structured study notes in Markdown using only facts explicitly present "
    "in the supplied material. Never invent background, examples, definitions, formulas, or context. "
    "If the material is short, produce a short note instead of expanding it with outside knowledge. "
    "Use this structure when the material supports it: '# Title', '## Summary', '## Key concepts', "
    "'## Detailed notes', and '## Formulas and definitions'. Omit empty sections. Use concise bullets, "
    "numbered steps for procedures, tables only for genuine comparisons, and bold only for key terms. "
    "Do not use emojis or decorative symbols. Preserve only exact timestamp or page references already "
    "present in the supplied material. Never output placeholders such as '[@ mm:ss]' or '[p. N]'. "
    "Output only the Markdown notes."
)

PLACEHOLDER_REFERENCE = re.compile(
    r"\s*\[(?:@\s*)?(?:mm:ss|p\.\s*N)\]",
    re.IGNORECASE,
)
DECORATIVE_SYMBOL = re.compile(
    "["
    "\U0001F000-\U0001FAFF"  # emoji and pictographs
    "\U00002600-\U000027BF"  # miscellaneous symbols and dingbats
    "]\ufe0f?"
)
DECORATIVE_BULLET = re.compile(r"^(\s*)[•●◦▪▫▸▹►‣]\s+", re.MULTILINE)
OUTER_MARKDOWN_FENCE = re.compile(
    r"^\s*```(?:markdown|md)?\s*\n(?P<body>.*)\n```\s*$",
    re.IGNORECASE | re.DOTALL,
)


def _clean_generated_markdown(markdown: str) -> str:
    """Normalize generated notes while preserving real citations and formulas."""
    fenced = OUTER_MARKDOWN_FENCE.match(markdown)
    cleaned = fenced.group("body") if fenced else markdown
    cleaned = PLACEHOLDER_REFERENCE.sub("", cleaned)
    cleaned = DECORATIVE_SYMBOL.sub("", cleaned)
    cleaned = DECORATIVE_BULLET.sub(r"\1- ", cleaned)
    cleaned = re.sub(r"^(\s*)\*\s+", r"\1- ", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()

CALENDAR_SYSTEM = (
    "Extract actionable calendar reminders from study material. Return JSON as "
    "{\"events\": [{\"title\": string, \"date\": \"YYYY-MM-DD\", "
    "\"start_time\": \"HH:MM\" or null, \"end_time\": \"HH:MM\" or null, "
    "\"description\": string}]}. Include only explicit upcoming exams, deadlines, "
    "submissions, classes, meetings, appointments, or direct requests to remember a date. "
    "Do not treat the capture date, historical dates, source citations, or vague mentions as events. "
    "Resolve relative dates against the supplied capture date. Return an empty events list when unsure."
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
                from core.video import analyze_frame, capture_stable_frames
                for frame_id in capture_stable_frames(item["id"], path):
                    result = analyze_frame(frame_id)
                    markdown = result["markdown"].strip()
                    frame = result["frame"]
                    if markdown != "NO_RELEVANT_CONTENT":
                        chunks.append({
                            "text": f"[@ {_mmss(frame['timestamp'])}] Visual from lecture:\n{markdown}",
                            "ts_start": frame["timestamp"], "image_path": frame["frame_path"],
                            "frame_id": frame_id,
                        })
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


def _classify(full_text: str, filename: str) -> tuple[str, str]:
    existing = ", ".join(s["name"] for s in db.list_subjects()) or "(none yet)"
    result = llm.chat_json(
        CLASSIFY_SYSTEM,
        f"Filename: {filename}\nExisting subjects: {existing}\n\nContent:\n{full_text[:4000]}",
    )
    return str(result.get("subject", "General")), str(result.get("title", "Untitled"))


def _generate_notes(full_text: str, chunks: list[dict]) -> str:
    sections = []
    for i in range(0, len(full_text), NOTES_INPUT_CHARS):
        part = full_text[i:i + NOTES_INPUT_CHARS]
        sections.append(_clean_generated_markdown(llm.chat(NOTES_SYSTEM, part, max_tokens=1500)))
    notes = "\n\n".join(sections)
    # Keep the source material in the note as well as the LLM's study guide.
    # This is deliberately not truncated: a lecture upload must retain its
    # complete timestamped transcript for reading and RAG retrieval.
    if any(chunk.get("ts_start") is not None for chunk in chunks):
        notes += "\n\n## Complete timestamped transcript\n\n" + full_text
    visuals = [chunk for chunk in chunks if chunk.get("frame_id")]
    if visuals:
        appendix = ["## Important lecture visuals"]
        for visual in visuals:
            label = _mmss(visual["ts_start"])
            appendix.extend([
                f"### Board or diagram at {label}",
                f"![Lecture visual at {label}](/api/video/frames/{visual['frame_id']}/image)",
                visual["text"],
            ])
        notes += "\n\n" + "\n\n".join(appendix)
    return notes


def _extract_calendar_reminders(full_text: str, capture_date: str) -> list[dict]:
    result = llm.chat_json(
        CALENDAR_SYSTEM,
        f"Today: {date.today().isoformat()}\nCapture date: {capture_date}\n\nMaterial:\n{full_text[:8000]}",
    )
    raw_events = result.get("events", [])
    if not isinstance(raw_events, list):
        return []
    events = []
    for raw in raw_events[:20]:
        if not isinstance(raw, dict) or not str(raw.get("title", "")).strip():
            continue
        try:
            event_date = date.fromisoformat(str(raw.get("date", "")))
        except ValueError:
            continue
        if event_date < date.today():
            continue
        start_time = raw.get("start_time") or None
        end_time = raw.get("end_time") or None
        try:
            if start_time:
                start_time = datetime.strptime(str(start_time), "%H:%M").strftime("%H:%M")
            if end_time:
                end_time = datetime.strptime(str(end_time), "%H:%M").strftime("%H:%M")
        except ValueError:
            start_time = None
            end_time = None
        events.append({
            "title": str(raw["title"]).strip()[:200],
            "event_date": event_date.isoformat(),
            "start_time": start_time,
            "end_time": end_time if start_time else None,
            "description": str(raw.get("description", "")).strip()[:1000],
        })
    return events


def _queue_calendar_reminders(item_id: int, full_text: str, capture_date: str,
                              source: str) -> None:
    try:
        for event in _extract_calendar_reminders(full_text, capture_date):
            description = f"Detected from Study Buddy: {source}"
            if event["description"]:
                description += f"\n\n{event['description']}"
            db.add_calendar_reminder(
                item_id, event["title"], event["event_date"],
                event["start_time"], event["end_time"], description,
            )
    except Exception:
        # Calendar automation must never prevent the source notes from being saved.
        traceback.print_exc()


def process_item(item: dict):
    db.set_status(item["id"], "processing")
    # A queued item stays an explicit error when the LAN LLM is down; do not
    # silently create a weaker transcript-only or heuristic note.
    llm.require_available()
    chunks = _extract(item)
    if not chunks:
        raise ValueError("no text could be extracted from this file")

    capture_date = item.get("capture_date") or datetime.fromtimestamp(
        item["created_at"]
    ).date().isoformat()
    capture_context = [f"[Capture date: {capture_date}]"]
    if item.get("metadata_text"):
        capture_context.append(f"[Capture context: {item['metadata_text'].strip()}]")
    chunks.insert(0, {"text": "\n".join(capture_context)})

    full_text = "\n\n".join(c["text"] for c in chunks)
    subject_name, title = _classify(full_text, item["filename"])
    subject_id = db.get_or_create_subject(subject_name)
    db.set_item_meta(item["id"], title, subject_id)

    notes_md = _generate_notes(full_text, chunks)
    db.add_note(item["id"], notes_md)

    source = f"{title} — {capture_date} ({item['filename']})"
    _queue_calendar_reminders(item["id"], full_text, capture_date, source)
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
            item = db.claim_next_pending_item()
            if item is None:
                time.sleep(2)
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
