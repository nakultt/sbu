"""SQLite metadata store: items, subjects, notes, chunks."""
import sqlite3
import time
from contextlib import contextmanager

from core.config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    title TEXT,
    subject_id INTEGER REFERENCES subjects(id),
    created_at REAL NOT NULL,
    processed_at REAL
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    markdown TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS audiobook_jobs (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    error TEXT,
    file TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    due TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS hw_pages (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    image_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    error TEXT,
    item_id INTEGER REFERENCES items(id),
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS hw_lines (
    id INTEGER PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES hw_pages(id),
    line_index INTEGER NOT NULL,
    bbox TEXT,
    crop_path TEXT NOT NULL,
    pred_text TEXT NOT NULL DEFAULT '',
    corrected_text TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    text TEXT NOT NULL,
    source_label TEXT NOT NULL,
    ts_start REAL,
    page INTEGER,
    image_path TEXT
);
CREATE TABLE IF NOT EXISTS video_frames (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    timestamp REAL NOT NULL,
    frame_path TEXT NOT NULL,
    stability REAL NOT NULL DEFAULT 0,
    sharpness REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'awaiting_review',
    consolidated_text TEXT,
    formatted_markdown TEXT,
    created_at REAL NOT NULL,
    reviewed_at REAL
);
CREATE TABLE IF NOT EXISTS video_ocr_segments (
    id INTEGER PRIMARY KEY,
    frame_id INTEGER NOT NULL REFERENCES video_frames(id),
    segment_index INTEGER NOT NULL,
    bbox TEXT NOT NULL,
    crop_path TEXT NOT NULL,
    raw_text TEXT NOT NULL DEFAULT '',
    table_markdown TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at REAL NOT NULL,
    UNIQUE(frame_id, segment_index)
);
"""


@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db():
    with conn() as c:
        c.executescript(SCHEMA)
        try:  # migration for hw_pages created before the ingest integration
            c.execute("ALTER TABLE hw_pages ADD COLUMN item_id INTEGER REFERENCES items(id)")
        except sqlite3.OperationalError:
            pass


def add_item(filename: str, stored_path: str, kind: str) -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO items (filename, stored_path, kind, created_at) VALUES (?,?,?,?)",
            (filename, stored_path, kind, time.time()),
        )
        return cur.lastrowid


def set_status(item_id: int, status: str, error: str | None = None):
    with conn() as c:
        c.execute(
            "UPDATE items SET status=?, error=?, processed_at=? WHERE id=?",
            (status, error, time.time() if status in ("done", "error") else None, item_id),
        )


def set_item_meta(item_id: int, title: str, subject_id: int):
    with conn() as c:
        c.execute("UPDATE items SET title=?, subject_id=? WHERE id=?", (title, subject_id, item_id))


def get_or_create_subject(name: str) -> int:
    name = name.strip() or "General"
    with conn() as c:
        row = c.execute("SELECT id FROM subjects WHERE name=?", (name,)).fetchone()
        if row:
            return row["id"]
        return c.execute(
            "INSERT INTO subjects (name, created_at) VALUES (?,?)", (name, time.time())
        ).lastrowid


def list_subjects():
    with conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM subjects ORDER BY name").fetchall()]


def list_items(subject_id: int | None = None):
    q = "SELECT items.*, subjects.name AS subject FROM items LEFT JOIN subjects ON subjects.id = items.subject_id"
    args: tuple = ()
    if subject_id is not None:
        q += " WHERE subject_id=?"
        args = (subject_id,)
    q += " ORDER BY items.created_at DESC"
    with conn() as c:
        return [dict(r) for r in c.execute(q, args).fetchall()]


def next_pending_item():
    with conn() as c:
        row = c.execute(
            "SELECT * FROM items WHERE status='pending' ORDER BY created_at LIMIT 1"
        ).fetchone()
        return dict(row) if row else None


def add_note(item_id: int, markdown: str) -> int:
    with conn() as c:
        return c.execute(
            "INSERT INTO notes (item_id, markdown, created_at) VALUES (?,?,?)",
            (item_id, markdown, time.time()),
        ).lastrowid


def notes_for_item(item_id: int):
    with conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM notes WHERE item_id=? ORDER BY created_at", (item_id,)
        ).fetchall()]


def notes_for_subject(subject_id: int):
    with conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT notes.*, items.title FROM notes JOIN items ON items.id = notes.item_id "
            "WHERE items.subject_id=? ORDER BY notes.created_at", (subject_id,)
        ).fetchall()]


def add_audiobook_job(name: str) -> int:
    with conn() as c:
        return c.execute(
            "INSERT INTO audiobook_jobs (name, created_at) VALUES (?,?)", (name, time.time())
        ).lastrowid


def finish_audiobook_job(job_id: int, file: str | None, error: str | None = None):
    with conn() as c:
        c.execute(
            "UPDATE audiobook_jobs SET status=?, file=?, error=? WHERE id=?",
            ("error" if error else "done", file, error, job_id),
        )


def list_audiobook_jobs(limit: int = 10):
    with conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM audiobook_jobs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()]


def list_tasks():
    with conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM tasks ORDER BY done, created_at DESC"
        ).fetchall()]


def add_task(label: str, due: str | None) -> int:
    with conn() as c:
        return c.execute(
            "INSERT INTO tasks (label, due, created_at) VALUES (?,?,?)",
            (label, due, time.time()),
        ).lastrowid


def set_task_done(task_id: int, done: bool):
    with conn() as c:
        c.execute("UPDATE tasks SET done=? WHERE id=?", (int(done), task_id))


def delete_task(task_id: int):
    with conn() as c:
        c.execute("DELETE FROM tasks WHERE id=?", (task_id,))


def add_hw_page(filename: str, image_path: str, item_id: int | None = None) -> int:
    with conn() as c:
        return c.execute(
            "INSERT INTO hw_pages (filename, image_path, item_id, created_at) VALUES (?,?,?,?)",
            (filename, image_path, item_id, time.time()),
        ).lastrowid


def set_hw_page_status(page_id: int, status: str, error: str | None = None):
    with conn() as c:
        c.execute("UPDATE hw_pages SET status=?, error=? WHERE id=?", (status, error, page_id))


def list_hw_pages():
    with conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT hw_pages.*, COUNT(hw_lines.id) AS line_count, "
            "SUM(hw_lines.corrected_text IS NOT NULL) AS corrected_count "
            "FROM hw_pages LEFT JOIN hw_lines ON hw_lines.page_id = hw_pages.id "
            "GROUP BY hw_pages.id ORDER BY hw_pages.created_at DESC"
        ).fetchall()]


def get_hw_page(page_id: int):
    with conn() as c:
        row = c.execute("SELECT * FROM hw_pages WHERE id=?", (page_id,)).fetchone()
        return dict(row) if row else None


def add_hw_line(page_id: int, line_index: int, bbox: str | None,
                crop_path: str, pred_text: str) -> int:
    with conn() as c:
        return c.execute(
            "INSERT INTO hw_lines (page_id, line_index, bbox, crop_path, pred_text, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (page_id, line_index, bbox, crop_path, pred_text, time.time()),
        ).lastrowid


def list_hw_lines(page_id: int):
    with conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM hw_lines WHERE page_id=? ORDER BY line_index", (page_id,)
        ).fetchall()]


def delete_hw_lines(page_id: int):
    import pathlib
    with conn() as c:
        for r in c.execute("SELECT crop_path FROM hw_lines WHERE page_id=?", (page_id,)).fetchall():
            pathlib.Path(r["crop_path"]).unlink(missing_ok=True)
        c.execute("DELETE FROM hw_lines WHERE page_id=?", (page_id,))


def set_hw_correction(line_id: int, corrected_text: str | None):
    with conn() as c:
        c.execute("UPDATE hw_lines SET corrected_text=? WHERE id=?", (corrected_text, line_id))


def hw_corrected_lines():
    """User-corrected lines, used as vocabulary hints for the vision model."""
    with conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT id, crop_path, corrected_text FROM hw_lines "
            "WHERE corrected_text IS NOT NULL AND TRIM(corrected_text) != '' "
            "ORDER BY created_at"
        ).fetchall()]


def add_chunk(item_id: int, text: str, source_label: str,
              ts_start: float | None = None, page: int | None = None,
              image_path: str | None = None) -> int:
    with conn() as c:
        return c.execute(
            "INSERT INTO chunks (item_id, text, source_label, ts_start, page, image_path) "
            "VALUES (?,?,?,?,?,?)",
            (item_id, text, source_label, ts_start, page, image_path),
        ).lastrowid


def add_video_frame(item_id: int, timestamp: float, frame_path: str,
                    stability: float, sharpness: float) -> int:
    with conn() as c:
        return c.execute(
            "INSERT INTO video_frames (item_id, timestamp, frame_path, stability, sharpness, created_at) "
            "VALUES (?,?,?,?,?,?)", (item_id, timestamp, frame_path, stability, sharpness, time.time())
        ).lastrowid


def list_video_frames(item_id: int | None = None):
    query = ("SELECT video_frames.*, items.title, items.filename, COUNT(video_ocr_segments.id) AS segment_count, "
             "SUM(video_ocr_segments.status = 'done') AS done_segments FROM video_frames "
             "JOIN items ON items.id = video_frames.item_id "
             "LEFT JOIN video_ocr_segments ON video_ocr_segments.frame_id = video_frames.id")
    args: tuple = ()
    if item_id is not None:
        query += " WHERE video_frames.item_id=?"
        args = (item_id,)
    query += " GROUP BY video_frames.id ORDER BY video_frames.created_at DESC, video_frames.timestamp"
    with conn() as c:
        return [dict(r) for r in c.execute(query, args).fetchall()]


def get_video_frame(frame_id: int):
    with conn() as c:
        row = c.execute("SELECT video_frames.*, items.title, items.filename, items.stored_path, subjects.name AS subject "
                        "FROM video_frames JOIN items ON items.id=video_frames.item_id "
                        "LEFT JOIN subjects ON subjects.id=items.subject_id "
                        "WHERE video_frames.id=?", (frame_id,)).fetchone()
        return dict(row) if row else None


def add_video_segment(frame_id: int, segment_index: int, bbox: str, crop_path: str) -> int:
    with conn() as c:
        cur = c.execute("INSERT OR IGNORE INTO video_ocr_segments "
                        "(frame_id, segment_index, bbox, crop_path, created_at) VALUES (?,?,?,?,?)",
                        (frame_id, segment_index, bbox, crop_path, time.time()))
        if cur.lastrowid:
            return cur.lastrowid
        return c.execute("SELECT id FROM video_ocr_segments WHERE frame_id=? AND segment_index=?",
                         (frame_id, segment_index)).fetchone()["id"]


def set_video_segment_result(segment_id: int, raw_text: str, table_markdown: str | None):
    with conn() as c:
        c.execute("UPDATE video_ocr_segments SET raw_text=?, table_markdown=?, status='done' WHERE id=?",
                  (raw_text, table_markdown, segment_id))


def list_video_segments(frame_id: int):
    with conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM video_ocr_segments WHERE frame_id=? "
                                            "ORDER BY segment_index", (frame_id,)).fetchall()]


def set_video_frame_review(frame_id: int, text: str, markdown: str):
    with conn() as c:
        c.execute("UPDATE video_frames SET status='reviewed', consolidated_text=?, formatted_markdown=?, "
                  "reviewed_at=? WHERE id=?", (text, markdown, time.time(), frame_id))
