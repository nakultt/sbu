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
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    text TEXT NOT NULL,
    source_label TEXT NOT NULL,
    ts_start REAL,
    page INTEGER,
    image_path TEXT
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


def add_chunk(item_id: int, text: str, source_label: str,
              ts_start: float | None = None, page: int | None = None,
              image_path: str | None = None) -> int:
    with conn() as c:
        return c.execute(
            "INSERT INTO chunks (item_id, text, source_label, ts_start, page, image_path) "
            "VALUES (?,?,?,?,?,?)",
            (item_id, text, source_label, ts_start, page, image_path),
        ).lastrowid
