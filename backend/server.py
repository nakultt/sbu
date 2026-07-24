"""FastAPI backend for the Study Buddy web frontend.

Wraps the existing core/ modules and runs the ingestion worker.
Run with:  .venv/bin/uvicorn server:app --port 8010
"""
import json
import shutil
import threading
import time
from pathlib import Path

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from core import db, llm, rag
from core.config import AUDIOBOOKS_DIR, DATA_DIR, HW_CROPS_DIR, HW_PAGES_DIR, INBOX_DIR
from core.ingest import start_worker

app = FastAPI(title="Study Buddy API")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    db.init_db()
    start_worker()


@app.get("/api/health")
def health():
    return {"ok": True, "llm": llm.is_available()}


@app.get("/api/stats")
def stats():
    with db.conn() as c:
        notes = c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        files = c.execute("SELECT COUNT(*) FROM items").fetchone()[0]
        chunks = c.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    audiobooks = len(list(AUDIOBOOKS_DIR.glob("*.wav")))
    usage = shutil.disk_usage(DATA_DIR)
    return {
        "notes": notes, "files": files, "chunks": chunks, "audiobooks": audiobooks,
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
async def upload(files: list[UploadFile]):
    for f in files:
        dest = INBOX_DIR / f"upload_{int(time.time()*1000)}_{f.filename}"
        dest.write_bytes(await f.read())
    return {"queued": len(files)}


class AskRequest(BaseModel):
    question: str
    subject: str | None = None


@app.post("/api/ask")
def ask(req: AskRequest):
    return rag.ask(req.question, req.subject)


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
        return {"error": "not found"}
    frame["segments"] = db.list_video_segments(frame_id)
    for segment in frame["segments"]:
        segment["crop_url"] = f"/api/video/segments/{segment['id']}/image"
    return _video_frame_payload(frame)


@app.get("/api/video/frames/{frame_id}/image")
def video_frame_image(frame_id: int):
    frame = db.get_video_frame(frame_id)
    if not frame or not Path(frame["frame_path"]).exists():
        return {"error": "not found"}
    return FileResponse(frame["frame_path"], media_type="image/jpeg")


@app.get("/api/video/items/{item_id}/file")
def video_file(item_id: int):
    with db.conn() as c:
        row = c.execute("SELECT stored_path, kind FROM items WHERE id=?", (item_id,)).fetchone()
    if not row or row["kind"] != "video" or not Path(row["stored_path"]).exists():
        return {"error": "not found"}
    return FileResponse(row["stored_path"], media_type="video/mp4")


@app.get("/api/video/segments/{segment_id}/image")
def video_segment_image(segment_id: int):
    with db.conn() as c:
        row = c.execute("SELECT crop_path FROM video_ocr_segments WHERE id=?", (segment_id,)).fetchone()
    if not row or not Path(row["crop_path"]).exists():
        return {"error": "not found"}
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


class TaskPatch(BaseModel):
    done: bool


@app.get("/api/tasks")
def tasks():
    return db.list_tasks()


@app.post("/api/tasks")
def create_task(req: TaskCreate):
    return {"id": db.add_task(req.label.strip(), req.due)}


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
