"""Ingestion pipeline: inbox watcher + queue worker.

Flow per item: extract text (STT/OCR/PDF) -> LLM classify + notes -> store
chunks in SQLite + LanceDB.
"""
import shutil
import logging
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

logger = logging.getLogger(__name__)

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
    "You are a careful study-note editor. Write accurate, highly readable Markdown using only facts "
    "explicitly present in the supplied material. Never invent background, examples, definitions, "
    "formulas, or context. If the source is short, keep the note short. "
    "Use only the useful sections among these exact level-two headings: '## Summary', "
    "'## Key concepts', '## Detailed notes', and '## Formulas and definitions'. Do not write a title "
    "or any level-one heading; the application adds it. Start with a heading and omit empty sections. "
    "Write a compact 2-5 sentence Summary. Under other sections, use short bullets with bold lead terms "
    "when that improves scanning. Use numbered lists only for real sequences or procedures, and tables "
    "only for genuine comparisons with consistent columns. Put mathematical notation in valid LaTeX "
    "delimiters. Avoid repetitive points, filler conclusions, emojis, decorative symbols, and excessive "
    "bold text. Preserve only exact timestamps or page references already present in the source. Never "
    "output placeholders such as '[@ mm:ss]' or '[p. N]'. "
    "If the material lists 'Available visuals' with tokens like [[FIG:1]], place the relevant tokens on "
    "their own line at the point you discuss that visual; output each token at most once and never invent "
    "tokens that were not listed. Output only the Markdown section body."
)

NOTE_SECTION_ORDER = (
    "Summary",
    "Key concepts",
    "Detailed notes",
    "Formulas and definitions",
)
NOTE_SECTION_ALIASES = {section.casefold(): section for section in NOTE_SECTION_ORDER}

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


def _safe_markdown_title(title: str) -> str:
    """Keep a classified title on one plain Markdown heading line."""
    title = re.sub(r"\s+", " ", title.splitlines()[0] if title.splitlines() else "")
    title = title.strip().lstrip("#").strip()
    return title or "Study notes"


def _assemble_structured_notes(title: str, generated_parts: list[str]) -> str:
    """Merge repeated LLM section headings into one predictable note document."""
    collected = {section: [] for section in NOTE_SECTION_ORDER}

    for raw_part in generated_parts:
        part = _clean_generated_markdown(raw_part)
        # Local models sometimes ignore the no-title instruction. The application
        # owns the canonical title, so discard model-written level-one headings.
        part = re.sub(r"^#\s+.*(?:\n+|$)", "", part, count=1).strip()
        matches = list(re.finditer(r"^##\s+(.+?)\s*$", part, flags=re.MULTILINE))
        if not matches:
            if part:
                collected["Detailed notes"].append(part)
            continue

        for index, match in enumerate(matches):
            heading = re.sub(r"[*_`]", "", match.group(1)).strip().casefold()
            section = NOTE_SECTION_ALIASES.get(heading, "Detailed notes")
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(part)
            content = part[start:end].strip()
            if content:
                collected[section].append(content)

    document = [f"# {_safe_markdown_title(title)}"]
    for section in NOTE_SECTION_ORDER:
        if collected[section]:
            document.extend([f"## {section}", "\n\n".join(collected[section])])
    return "\n\n".join(document)

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
        if kind == "video":
            # Rewrite the stored file into a seekable progressive MP4 so the
            # web player can jump straight to a cited timestamp instead of
            # streaming a large lecture from the start. Rewritten in place, so
            # the serving path is unchanged.
            from core.video import optimize_for_streaming
            try:
                optimize_for_streaming(path)
            except Exception:
                traceback.print_exc()  # a non-optimized video still plays fine
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
            {
                "text": f"[p. {p['page']}] {chunk}",
                "page": p["page"],
                "image_path": p.get("image_path"),
            }
            for p in extract_pdf(path, item_id=item["id"])
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


def _visual_caption(chunk_text: str) -> str:
    """A short caption for a captured video frame from its chunk text."""
    body = chunk_text.split("Visual from lecture:", 1)[-1]
    for line in body.splitlines():
        cleaned = re.sub(r"^[#>*\-\s]+", "", line).strip().strip("*_`")
        if cleaned:
            return cleaned[:120]
    return "Lecture visual"


def _collect_visuals(item: dict, chunks: list[dict]) -> list[dict]:
    """Unified inline-visual manifest: captured video frames + document figures."""
    from core import figures

    visuals: list[dict] = []
    token = 1
    for chunk in chunks:
        if chunk.get("frame_id") and chunk.get("ts_start") is not None:
            visuals.append({
                "token_id": token,
                "url": f"/api/video/frames/{chunk['frame_id']}/image",
                "caption": _visual_caption(chunk["text"]),
                "anchor": ("ts", int(chunk["ts_start"])),
            })
            token += 1
    try:
        if item["kind"] == "pdf":
            for fig in figures.extract_pdf_figures(item["stored_path"], item["id"]):
                visuals.append({
                    "token_id": token,
                    "url": f"/api/doc/figures/{fig['filename']}",
                    "caption": fig["caption"],
                    "anchor": ("page", fig["page"]),
                })
                token += 1
        elif item["kind"] == "image":
            fig = figures.register_image_figure(item["stored_path"], item["id"])
            if fig:
                visuals.append({
                    "token_id": token,
                    "url": f"/api/doc/figures/{fig['filename']}",
                    "caption": fig["caption"],
                    "anchor": None,
                })
                token += 1
    except Exception:
        traceback.print_exc()  # notes must still generate without figures
    return visuals


def _generate_notes(full_text: str, chunks: list[dict], title: str = "Study notes",
                    visuals: list[dict] | None = None) -> str:
    from core.notes import build_manifest_block, place_visuals

    visuals = visuals or []
    manifest = build_manifest_block(visuals)
    sections = []
    part_count = max(1, (len(full_text) + NOTES_INPUT_CHARS - 1) // NOTES_INPUT_CHARS)
    for part_number, i in enumerate(range(0, len(full_text), NOTES_INPUT_CHARS), start=1):
        part = full_text[i:i + NOTES_INPUT_CHARS]
        prompt = (
            f"Document title: {title}\nSource part: {part_number} of {part_count}\n\n"
            f"Source material:\n{part}{manifest}"
        )
        sections.append(llm.chat(NOTES_SYSTEM, prompt, max_tokens=1800))
    notes = _assemble_structured_notes(title, sections)
    # Keep the source material in the note as well as the LLM's study guide.
    # This is deliberately not truncated: a lecture upload must retain its
    # complete timestamped transcript for reading and RAG retrieval.
    if any(chunk.get("ts_start") is not None for chunk in chunks):
        notes += "\n\n## Complete timestamped transcript\n\n" + full_text
    # Visuals are placed inline at their page/timestamp anchor, never in a section.
    return place_visuals(notes, visuals)


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

    visuals = _collect_visuals(item, chunks)
    notes_md = _generate_notes(full_text, chunks, title, visuals)
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
    try:
        vectorstore.add_chunks(rows)
    except Exception as error:
        raise RuntimeError(f"Vector indexing failed: {error}") from error
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
    logger.info("ingestion worker ready")
    while stop is None or not stop.is_set():
        try:
            _sweep_inbox()
            item = db.claim_next_pending_item()
            if item is None:
                if stop is None:
                    time.sleep(2)
                else:
                    stop.wait(2)
                continue
            try:
                logger.info(
                    "ingestion started",
                    extra={"item_id": item["id"], "filename": item["filename"]},
                )
                process_item(item)
                logger.info("ingestion completed", extra={"item_id": item["id"]})
            except Exception as e:
                logger.exception("ingestion failed", extra={"item_id": item["id"]})
                db.set_status(item["id"], "error", str(e)[:500])
        except Exception:
            logger.exception("ingestion worker iteration failed")
            if stop is None:
                time.sleep(5)
            else:
                stop.wait(5)
    logger.info("ingestion worker stopped")


_worker_lock = threading.Lock()
_worker_thread: threading.Thread | None = None
_worker_stop: threading.Event | None = None


def start_worker() -> threading.Thread:
    """Start the process-wide ingestion worker exactly once."""
    global _worker_thread, _worker_stop
    with _worker_lock:
        if _worker_thread is not None and _worker_thread.is_alive():
            return _worker_thread
        _worker_stop = threading.Event()
        _worker_thread = threading.Thread(
            target=worker_loop,
            args=(_worker_stop,),
            daemon=True,
            name="ingest-worker",
        )
        _worker_thread.start()
        return _worker_thread


def stop_worker(timeout: float = 10.0) -> None:
    """Request a clean worker shutdown and wait for its current unit of work."""
    global _worker_thread, _worker_stop
    with _worker_lock:
        thread = _worker_thread
        stop = _worker_stop
        if thread is None:
            return
        if stop is not None:
            stop.set()
    thread.join(timeout=timeout)
    if thread.is_alive():
        logger.warning("ingestion worker did not stop before timeout")
        return
    with _worker_lock:
        if _worker_thread is thread:
            _worker_thread = None
            _worker_stop = None
