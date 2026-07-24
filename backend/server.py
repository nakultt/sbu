"""FastAPI backend for the Study Buddy web frontend.

Wraps the existing core/ modules and runs the ingestion worker.
Run with:  .venv/bin/uvicorn server:app --port 8010
"""
import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from core import db, flashcards, llm, rag
from core.config import AUDIOBOOKS_DIR, DATA_DIR, FILES_DIR, HW_CROPS_DIR, HW_PAGES_DIR, INBOX_DIR, kind_of
from core.dates import capture_date_from_text, event_date_from_due_text
from core.ingest import start_worker

# Backward-compatible names for callers that imported the original server helpers.
_capture_date_from_text = capture_date_from_text
_event_date_from_due_text = event_date_from_due_text

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize durable local services once per API process."""
    db.init_db()
    start_worker()
    yield


app = FastAPI(
    title="Study Buddy API",
    description="Local-first API for the Study Buddy learning workspace.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    # The local UI is often opened through 127.0.0.1 or the Mac's LAN address.
    # No credentials are used, so accepting any local-browser origin is safe here.
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "study-buddy-api",
        "version": app.version,
        "llm": llm.is_available(),
        "storage": DATA_DIR.exists() and os.access(DATA_DIR, os.W_OK),
    }


@app.get("/api/stats")
def stats():
    with db.conn() as c:
        notes = c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        files = c.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        chunks = c.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        flashcard_total = c.execute("SELECT COUNT(*) FROM flashcards").fetchone()[0]
    audiobooks = len(list(AUDIOBOOKS_DIR.glob("*.wav")))
    usage = shutil.disk_usage(DATA_DIR)
    return {
        "notes": notes, "files": files, "chunks": chunks,
        "flashcards": flashcard_total, "audiobooks": audiobooks,
        "disk_used_gb": round((usage.total - usage.free) / 1e9, 1),
        "disk_total_gb": round(usage.total / 1e9, 1),
    }


@app.get("/api/subjects")
def subjects():
    return db.list_subjects()


@app.get("/api/items")
def items(subject_id: int | None = None):
    return db.list_items(subject_id)


@app.get("/api/notes")
def notes(limit: int = 20):
    with db.conn() as c:
        rows = c.execute(
            "SELECT notes.id, notes.item_id, notes.markdown, notes.created_at, "
            "items.title, items.kind, subjects.name AS subject "
            "FROM notes JOIN items ON items.id = notes.item_id "
            "LEFT JOIN subjects ON subjects.id = items.subject_id "
            "ORDER BY notes.created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        body = d.pop("markdown")
        d["preview"] = " ".join(body.replace("#", "").replace("*", "").split())[:120]
        out.append(d)
    return out


def _download_name(title: str | None, suffix: str) -> str:
    """Build a safe, readable filename for a Content-Disposition header."""
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "", title or "note").strip(" .") or "note"
    return f"{stem[:80]}{suffix}"


@app.get("/api/notes/export")
def export_notes():
    with db.conn() as c:
        rows = c.execute(
            "SELECT items.title, subjects.name AS subject, notes.markdown, notes.created_at "
            "FROM notes JOIN items ON items.id = notes.item_id "
            "LEFT JOIN subjects ON subjects.id = items.subject_id "
            "ORDER BY notes.created_at"
        ).fetchall()
    backup = {
        "format": "study-buddy-notes",
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "notes": [dict(row) for row in rows],
    }
    stamp = datetime.now().strftime("%Y-%m-%d")
    return Response(
        content=json.dumps(backup, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="study-buddy-notes-{stamp}.json"'},
    )


@app.post("/api/notes/import")
async def import_notes(backup: UploadFile):
    raw = await backup.read(100_000_001)
    if len(raw) > 100_000_000:
        raise HTTPException(413, "Import file is larger than 100 MB")
    filename = backup.filename or ""
    if Path(filename).suffix.lower() in {".md", ".markdown", ".txt"}:
        try:
            markdown = raw.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(400, "Markdown notes must use UTF-8 text encoding")
        payload = {
            "format": "study-buddy-notes",
            "version": 1,
            "notes": [{
                "title": Path(filename).stem.strip() or "Imported note",
                "subject": "Imported",
                "markdown": markdown,
            }],
        }
    else:
        try:
            payload = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise HTTPException(400, "Choose a Study Buddy JSON backup or a Markdown note")

        if not isinstance(payload, dict) or payload.get("format") != "study-buddy-notes":
            raise HTTPException(400, "This is not a Study Buddy notes backup")
        if payload.get("version") != 1 or not isinstance(payload.get("notes"), list):
            raise HTTPException(400, "This backup version is not supported")

    imported = 0
    skipped = 0
    now = time.time()
    with db.conn() as c:
        for entry in payload["notes"]:
            if not isinstance(entry, dict) or not isinstance(entry.get("markdown"), str):
                raise HTTPException(400, "The backup contains an invalid note")
            markdown = entry["markdown"]
            if not markdown.strip():
                skipped += 1
                continue
            title = entry.get("title") if isinstance(entry.get("title"), str) else None
            subject = entry.get("subject") if isinstance(entry.get("subject"), str) else None
            created_at = entry.get("created_at")
            if not isinstance(created_at, (int, float)) or created_at <= 0:
                created_at = now

            duplicate = c.execute(
                "SELECT 1 FROM notes JOIN items ON items.id = notes.item_id "
                "LEFT JOIN subjects ON subjects.id = items.subject_id "
                "WHERE notes.markdown=? AND COALESCE(items.title, '')=? "
                "AND COALESCE(subjects.name, '')=? LIMIT 1",
                (markdown, title or "", subject or ""),
            ).fetchone()
            if duplicate:
                skipped += 1
                continue

            subject_id = None
            if subject and subject.strip():
                clean_subject = subject.strip()
                row = c.execute("SELECT id FROM subjects WHERE name=?", (clean_subject,)).fetchone()
                subject_id = row["id"] if row else c.execute(
                    "INSERT INTO subjects (name, created_at) VALUES (?,?)", (clean_subject, now)
                ).lastrowid
            filename = _download_name(title, ".md")
            item_id = c.execute(
                "INSERT INTO items "
                "(filename, stored_path, kind, status, title, subject_id, created_at, processed_at) "
                "VALUES (?,?,?,'done',?,?,?,?)",
                (filename, "", "imported note", title, subject_id, created_at, now),
            ).lastrowid
            c.execute(
                "INSERT INTO notes (item_id, markdown, created_at) VALUES (?,?,?)",
                (item_id, markdown, created_at),
            )
            imported += 1
    return {"imported": imported, "skipped": skipped}


@app.get("/api/notes/{note_id}/download")
def download_note(note_id: int):
    with db.conn() as c:
        row = c.execute(
            "SELECT notes.markdown, items.title FROM notes "
            "JOIN items ON items.id = notes.item_id WHERE notes.id=?", (note_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Note not found")
    return Response(
        content=row["markdown"],
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{_download_name(row["title"], ".md")}"'},
    )


@app.get("/api/notes/{note_id}")
def note_detail(note_id: int):
    with db.conn() as c:
        row = c.execute(
            "SELECT notes.*, items.title, subjects.name AS subject "
            "FROM notes JOIN items ON items.id = notes.item_id "
            "LEFT JOIN subjects ON subjects.id = items.subject_id "
            "WHERE notes.id=?", (note_id,)
        ).fetchone()
    return dict(row) if row else {}


@app.post("/api/upload")
async def upload(
    files: list[UploadFile] | None = File(default=None),
    text: str = Form(default=""),
):
    """Stream uploads to permanent storage and queue them immediately."""
    clean_text = text.strip()
    if not files and not clean_text:
        raise HTTPException(400, "Add at least one file or some text")
    if len(clean_text) > 1_000_000:
        raise HTTPException(413, "Text is larger than 1 MB")
    dated = capture_date_from_text(clean_text)

    queued = []
    for upload_file in files or []:
        filename = Path(upload_file.filename or "upload").name
        extension_kind = kind_of(Path(filename))
        if extension_kind is None:
            raise HTTPException(415, f"Unsupported file type: {filename}")
        # MediaRecorder commonly produces audio-only WebM files. The .webm
        # extension alone is ambiguous, so prefer the browser-provided media
        # family after the extension has passed the supported-file allowlist.
        content_type = (upload_file.content_type or "").lower()
        upload_kind = (
            "audio" if content_type.startswith("audio/")
            else "video" if content_type.startswith("video/")
            else extension_kind
        )
        token = uuid.uuid4().hex
        destination = FILES_DIR / f"{int(time.time() * 1000)}_{token}_{filename}"
        partial = destination.with_suffix(destination.suffix + ".part")
        size = 0
        try:
            with partial.open("wb") as output:
                while block := await upload_file.read(1024 * 1024):
                    output.write(block)
                    size += len(block)
            if size == 0:
                raise HTTPException(400, f"{filename} is empty")
            os.replace(partial, destination)
            item_id = db.add_item(filename, str(destination), upload_kind, clean_text or None, dated)
            queued.append({"id": item_id, "filename": filename, "size": size, "kind": upload_kind})
        except Exception:
            partial.unlink(missing_ok=True)
            destination.unlink(missing_ok=True)
            raise
        finally:
            await upload_file.close()

    if not files:
        filename = f"text-capture-{dated}-{uuid4().hex[:6]}.txt"
        dest = FILES_DIR / filename
        dest.write_text(clean_text, encoding="utf-8")
        item_id = db.add_item(filename, str(dest), "text", None, dated)
        queued.append({"id": item_id, "filename": filename, "size": len(clean_text)})

    return {"queued": len(queued), "items": queued, "capture_date": dated}


class AskRequest(BaseModel):
    question: str
    subject: str | None = None


def _answer_question(question: str, subject: str | None = None):
    question = question.strip()
    if not question:
        raise HTTPException(400, "Question cannot be empty")
    try:
        result = flashcards.maybe_create_from_chat(question, subject)
        if result is None:
            result = rag.ask(question, subject, k=7)
    except HTTPException:
        raise
    except Exception:
        logging.getLogger(__name__).exception("Ask workflow failed")
        raise HTTPException(503, "The local AI could not answer right now. Check LM Studio and try again")
    # Persist the pair only after an answer succeeds, avoiding orphaned user
    # turns when the local model or retrieval service is temporarily unavailable.
    db.add_chat_turn(role="user", content=question)
    db.add_chat_turn(
        role="assistant",
        content=result["answer"],
        sources=result.get("sources"),
        videos=result.get("videos"),
        images=result.get("images"),
    )
    return result


@app.post("/api/ask")
def ask_question(req: AskRequest):
    return _answer_question(req.question, req.subject)


@app.post("/api/ask/audio")
async def ask_audio(audio: UploadFile = File(...), subject: str = Form(default="")):
    """Transcribe a short spoken question, then run the normal ask workflow."""
    filename = Path(audio.filename or "question.webm").name
    content_type = (audio.content_type or "").lower()
    if not content_type.startswith("audio/"):
        raise HTTPException(415, "Record or upload an audio question")

    suffix = Path(filename).suffix.lower() or ".webm"
    temporary = Path(tempfile.NamedTemporaryFile(suffix=suffix, delete=False).name)
    size = 0
    try:
        with temporary.open("wb") as output:
            while block := await audio.read(1024 * 1024):
                size += len(block)
                if size > 25 * 1024 * 1024:
                    raise HTTPException(413, "Voice question is larger than 25 MB")
                output.write(block)
        if size == 0:
            raise HTTPException(400, "Voice question is empty")

        from core.stt import transcribe_media
        try:
            segments = await run_in_threadpool(transcribe_media, str(temporary))
        except FileNotFoundError:
            raise HTTPException(503, "ffmpeg is required for voice questions")
        except Exception:
            logging.getLogger(__name__).exception("Voice question transcription failed")
            raise HTTPException(422, "The voice question could not be transcribed")
        transcript = " ".join(segment["text"].strip() for segment in segments if segment.get("text")).strip()
        if not transcript:
            raise HTTPException(422, "No speech was detected. Please try again closer to the microphone")
        result = await run_in_threadpool(_answer_question, transcript, subject.strip() or None)
        return {**result, "transcript": transcript}
    finally:
        await audio.close()
        temporary.unlink(missing_ok=True)


@app.get("/api/chat")
def chat_history(limit: int = 200):
    return db.list_chat_turns(max(1, min(limit, 1000)))


@app.delete("/api/chat")
def clear_chat_history():
    db.clear_chat_turns()
    return {"ok": True}


@app.get("/api/video/items/{item_id}/frames")
def list_video_frames(item_id: int):
    return db.list_video_frames(item_id)



@app.get("/api/video/frames/{frame_id}/segments")
def list_video_segments(frame_id: int):
    return db.list_video_segments(frame_id)


def _video_frame_payload(frame: dict) -> dict:
    frame["image_url"] = f"/api/video/frames/{frame['id']}/image"
    frame["video_url"] = f"/api/video/items/{frame['item_id']}/file"
    return frame


@app.get("/api/video/frames")
def video_frames(item_id: int | None = None):
    return [_video_frame_payload(frame) for frame in db.list_video_frames(item_id)]


@app.get("/api/video/frames/{frame_id}")
def video_frame(frame_id: int):
    frame = db.get_video_frame(frame_id)
    if not frame:
        raise HTTPException(404, "Video frame not found")
    frame["segments"] = db.list_video_segments(frame_id)
    for segment in frame["segments"]:
        segment["crop_url"] = f"/api/video/segments/{segment['id']}/image"
    return _video_frame_payload(frame)


@app.get("/api/video/frames/{frame_id}/image")
def video_frame_image(frame_id: int):
    frame = db.get_video_frame(frame_id)
    if not frame or not Path(frame["frame_path"]).exists():
        raise HTTPException(404, "Video frame image not found")
    return FileResponse(frame["frame_path"], media_type="image/jpeg")


@app.get("/api/video/items/{item_id}/file")
def video_file(item_id: int):
    with db.conn() as c:
        row = c.execute("SELECT stored_path, kind FROM items WHERE id=?", (item_id,)).fetchone()
    if not row or row["kind"] != "video" or not Path(row["stored_path"]).exists():
        raise HTTPException(404, "Video not found")
    return FileResponse(row["stored_path"])


@app.get("/api/chunks/{chunk_id}/image")
def chunk_image(chunk_id: int):
    with db.conn() as c:
        row = c.execute("SELECT image_path FROM chunks WHERE id=?", (chunk_id,)).fetchone()
    if not row or not row["image_path"] or not Path(row["image_path"]).exists():
        raise HTTPException(404, "image not found")
    return FileResponse(row["image_path"])


@app.get("/api/video/segments/{segment_id}/image")
def video_segment_image(segment_id: int):
    with db.conn() as c:
        row = c.execute("SELECT crop_path FROM video_ocr_segments WHERE id=?", (segment_id,)).fetchone()
    if not row or not Path(row["crop_path"]).exists():
        raise HTTPException(404, "Video segment image not found")
    return FileResponse(row["crop_path"], media_type="image/png")


@app.get("/api/video/frames/{frame_id}/ocr-stream")
def video_ocr_stream(frame_id: int):
    """SSE: one small board crop result per event, never one final batch."""
    def events():
        try:
            from core.video import prepare_segments, run_segment_ocr
            segments = prepare_segments(frame_id)
            for segment in segments:
                if segment["status"] == "done":
                    result = segment
                else:
                    result = run_segment_ocr(segment)
                result = dict(result)
                result["crop_url"] = f"/api/video/segments/{result['id']}/image"
                yield f"event: segment\ndata: {json.dumps(result)}\n\n"
            yield "event: complete\ndata: {}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)[:400]})}\n\n"
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.post("/api/video/frames/{frame_id}/verify")
def verify_video_frame(frame_id: int):
    from core import vectorstore
    from core.video import consolidate_frame
    result = consolidate_frame(frame_id)
    frame = result["frame"]
    chunk_id = db.add_chunk(frame["item_id"], result["markdown"], f"{frame['title'] or frame['filename']} — verified board",
                            ts_start=frame["timestamp"], image_path=frame["frame_path"])
    vectorstore.add_chunks([{
        "chunk_id": chunk_id, "item_id": frame["item_id"], "subject": frame["subject"] or "General",
        "source_label": f"{frame['title'] or frame['filename']} — verified board",
        "text": result["markdown"], "ts_start": frame["timestamp"], "image_path": frame["frame_path"],
    }])
    return {"markdown": result["markdown"], "frame": _video_frame_payload(frame)}


@app.delete("/api/video/frames/{frame_id}")
def delete_video_frame(frame_id: int):
    if not db.delete_video_frame(frame_id):
        raise HTTPException(404, "Frame not found")
    return {"ok": True}


@app.get("/api/flashcards")
def flashcard_decks():
    return db.list_flashcard_decks()


@app.get("/api/flashcards/{deck_id}")
def flashcard_deck(deck_id: int):
    deck = db.get_flashcard_deck(deck_id)
    if deck is None:
        raise HTTPException(404, "Flashcard deck not found")
    return deck


@app.delete("/api/flashcards/{deck_id}")
def remove_flashcard_deck(deck_id: int):
    if not db.delete_flashcard_deck(deck_id):
        raise HTTPException(404, "Flashcard deck not found")
    return {"ok": True}


@app.get("/api/audiobooks/jobs")
def audiobook_jobs():
    return db.list_audiobook_jobs()


@app.get("/api/audiobooks")
def audiobooks():
    return [
        {"name": p.name, "created_at": p.stat().st_mtime, "size_mb": round(p.stat().st_size / 1e6, 1)}
        for p in sorted(AUDIOBOOKS_DIR.glob("*.wav"), key=lambda p: -p.stat().st_mtime)
    ]


@app.get("/api/audiobooks/{name}")
def audiobook_file(name: str):
    path = (AUDIOBOOKS_DIR / Path(name).name).resolve()
    if path.parent != AUDIOBOOKS_DIR.resolve() or not path.exists():
        return {"error": "not found"}
    return FileResponse(path, media_type="audio/wav")


@app.get("/api/calendar/google/status")
def google_calendar_status():
    from core import google_calendar

    counts = db.calendar_reminder_counts()
    return {
        "configured": google_calendar.is_configured(),
        "connected": google_calendar.credentials() is not None,
        "oauth_error": google_calendar.last_oauth_error(),
        "reminders": {
            "pending": counts.get("approved", 0) + counts.get("error", 0),
            "proposed": counts.get("proposed", 0),
            "created": counts.get("created", 0),
        },
    }


@app.get("/api/calendar/google/auth-url")
def google_calendar_auth_url():
    from core import google_calendar

    try:
        return {"url": google_calendar.authorization_url()}
    except RuntimeError as error:
        raise HTTPException(503, str(error))


@app.get("/api/calendar/google/callback")
def google_calendar_callback(code: str = "", state: str = "", error: str = ""):
    from core import google_calendar

    if error or not code or not state:
        return RedirectResponse("http://localhost:3000/calendar?google=denied")
    try:
        google_calendar.complete_authorization(code, state)
    except Exception as callback_error:
        import logging
        logging.getLogger(__name__).error(
            "Google Calendar OAuth callback failed: %s", callback_error, exc_info=True
        )
        google_calendar.record_oauth_error(callback_error)
        return RedirectResponse("http://localhost:3000/calendar?google=error")
    return RedirectResponse("http://localhost:3000/calendar?google=connected")


@app.get("/api/calendar/google/events")
def google_calendar_events(time_min: str, time_max: str):
    from core import google_calendar

    try:
        start = datetime.fromisoformat(time_min.replace("Z", "+00:00"))
        end = datetime.fromisoformat(time_max.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "Calendar range must use ISO date-time values")
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise HTTPException(400, "Calendar range is invalid")
    try:
        return google_calendar.list_events(time_min, time_max)
    except PermissionError as error:
        raise HTTPException(401, str(error))
    except Exception:
        raise HTTPException(502, "Google Calendar could not be reached")


@app.delete("/api/calendar/google")
def google_calendar_disconnect():
    from core import google_calendar

    google_calendar.disconnect()
    return {"ok": True}


@app.post("/api/calendar/google/sync")
def google_calendar_sync():
    from core import google_calendar

    if not google_calendar.credentials():
        raise HTTPException(401, "Google Calendar is not connected")
    return google_calendar.sync_pending_reminders()


@app.get("/api/calendar/proposals")
def calendar_proposals():
    return db.list_calendar_proposals()


@app.post("/api/calendar/proposals/{reminder_id}/approve")
def approve_calendar_proposal(reminder_id: int):
    from core import google_calendar

    if not google_calendar.credentials():
        raise HTTPException(401, "Google Calendar is not connected")
    db.set_calendar_reminder_status(reminder_id, "approved")
    result = google_calendar.sync_pending_reminders()
    return {"ok": True, **result}


@app.post("/api/calendar/proposals/{reminder_id}/dismiss")
def dismiss_calendar_proposal(reminder_id: int):
    db.set_calendar_reminder_status(reminder_id, "dismissed")
    return {"ok": True}


class AudiobookRequest(BaseModel):
    note_ids: list[int]
    name: str


@app.post("/api/audiobooks")
def make_audiobook(req: AudiobookRequest):
    with db.conn() as c:
        rows = c.execute(
            f"SELECT markdown FROM notes WHERE id IN ({','.join('?'*len(req.note_ids))})",
            req.note_ids,
        ).fetchall()
    combined = "\n\n".join(r["markdown"] for r in rows)
    if not combined.strip():
        return {"error": "no notes selected"}
    job_id = db.add_audiobook_job(req.name)

    def run():
        try:
            from core.audiobook import generate
            path = generate(combined, req.name)
            db.finish_audiobook_job(job_id, path.name)
        except Exception as e:
            db.finish_audiobook_job(job_id, None, str(e)[:500])

    threading.Thread(target=run, daemon=True, name=f"audiobook-{job_id}").start()
    return {"job_id": job_id, "status": "processing"}


class TaskCreate(BaseModel):
    label: str
    due: str | None = None
    add_to_calendar: bool = False


class TaskPatch(BaseModel):
    done: bool


@app.get("/api/tasks")
def tasks():
    return db.list_tasks()


@app.post("/api/tasks")
def create_task(req: TaskCreate):
    label = req.label.strip()
    if not label:
        raise HTTPException(400, "Task label is required")
    task_id = db.add_task(label, req.due)
    result = {"id": task_id, "calendar_added": False}
    if req.add_to_calendar:
        if not req.due:
            raise HTTPException(400, "A due date is required to add a task to Google Calendar")
        event_date = event_date_from_due_text(req.due)
        if event_date is None:
            raise HTTPException(400, "Enter a calendar date such as 2026-08-20, August 20, today, or tomorrow")
        from core import google_calendar
        try:
            event_id = google_calendar.create_task_event({"id": task_id, "label": label}, event_date)
        except PermissionError as error:
            raise HTTPException(401, str(error))
        except Exception:
            raise HTTPException(502, "Google Calendar could not create the task event")
        db.set_task_google_event(task_id, event_id)
        result["calendar_added"] = True
    return result


@app.patch("/api/tasks/{task_id}")
def patch_task(task_id: int, req: TaskPatch):
    db.set_task_done(task_id, req.done)
    return {"ok": True}


@app.delete("/api/tasks/{task_id}")
def remove_task(task_id: int):
    db.delete_task(task_id)
    return {"ok": True}


@app.post("/api/handwriting/upload")
async def handwriting_upload(files: list[UploadFile]):
    page_ids = []
    for f in files:
        dest = HW_PAGES_DIR / f"page_{int(time.time()*1000)}_{Path(f.filename).name}"
        dest.write_bytes(await f.read())
        page_id = db.add_hw_page(f.filename, str(dest))
        page_ids.append(page_id)

        def run(pid=page_id):
            try:
                from core.handwriting import process_page
                process_page(pid)
            except Exception:
                pass  # status/error already stored by process_page

        threading.Thread(target=run, daemon=True, name=f"hw-page-{page_id}").start()
    return {"page_ids": page_ids}


@app.get("/api/handwriting/pages")
def handwriting_pages():
    return db.list_hw_pages()


@app.get("/api/handwriting/pages/{page_id}")
def handwriting_page(page_id: int):
    page = db.get_hw_page(page_id)
    if not page:
        return {"error": "not found"}
    lines = db.list_hw_lines(page_id)
    for ln in lines:
        ln["crop_url"] = f"/api/handwriting/crops/{Path(ln['crop_path']).name}"
    page["lines"] = lines
    return page


@app.get("/api/handwriting/crops/{name}")
def handwriting_crop(name: str):
    path = (HW_CROPS_DIR / Path(name).name).resolve()
    if path.parent != HW_CROPS_DIR.resolve() or not path.exists():
        return {"error": "not found"}
    return FileResponse(path, media_type="image/png")


@app.get("/api/handwriting/pageimage/{page_id}")
def handwriting_page_image(page_id: int):
    page = db.get_hw_page(page_id)
    if not page:
        return {"error": "not found"}
    return FileResponse(page["image_path"])


class LineCorrection(BaseModel):
    corrected_text: str | None


@app.patch("/api/handwriting/lines/{line_id}")
def correct_line(line_id: int, req: LineCorrection):
    text = req.corrected_text.strip() if req.corrected_text else None
    db.set_hw_correction(line_id, text or None)
    return {"ok": True}


@app.post("/api/handwriting/pages/{page_id}/to-notes")
def handwriting_to_notes(page_id: int):
    """Drop the page's text into the inbox so the normal pipeline makes notes."""
    page = db.get_hw_page(page_id)
    if not page:
        return {"error": "not found"}
    lines = db.list_hw_lines(page_id)
    text = "\n".join((ln["corrected_text"] or ln["pred_text"]) for ln in lines).strip()
    if not text:
        return {"error": "page has no text yet"}
    stem = Path(page["filename"]).stem or "handwriting"
    (INBOX_DIR / f"handwritten_{stem}_{page_id}.txt").write_text(text)
    return {"ok": True}


@app.get("/api/handwriting/status")
def handwriting_status():
    return {"corrected_lines": len(db.hw_corrected_lines())}


@app.get("/api/activity")
def activity(limit: int = 10):
    with db.conn() as c:
        items_rows = c.execute(
            "SELECT filename, kind, status, created_at, title FROM items "
            "ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        notes_rows = c.execute(
            "SELECT notes.created_at, items.title FROM notes "
            "JOIN items ON items.id = notes.item_id "
            "ORDER BY notes.created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    events = [
        {"type": "file", "label": f"File added: {r['filename']}", "at": r["created_at"]}
        for r in items_rows
    ] + [
        {"type": "note", "label": f"Note created: {r['title'] or 'Untitled'}", "at": r["created_at"]}
        for r in notes_rows
    ]
    return sorted(events, key=lambda e: -e["at"])[:limit]
