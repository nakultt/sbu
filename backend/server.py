"""FastAPI backend for the Study Buddy web frontend.

Wraps the existing core/ modules and runs the ingestion worker.
Run with:  .venv/bin/uvicorn server:app --port 8010
"""
import shutil
import time
from pathlib import Path

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core import db, llm, rag
from core.config import AUDIOBOOKS_DIR, DATA_DIR, INBOX_DIR
from core.ingest import start_worker

app = FastAPI(title="Study Buddy API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    from core.audiobook import generate
    with db.conn() as c:
        rows = c.execute(
            f"SELECT markdown FROM notes WHERE id IN ({','.join('?'*len(req.note_ids))})",
            req.note_ids,
        ).fetchall()
    combined = "\n\n".join(r["markdown"] for r in rows)
    path = generate(combined, req.name)
    return {"file": path.name}


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
