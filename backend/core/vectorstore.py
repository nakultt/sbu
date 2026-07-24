"""LanceDB chunk index: vector search with metadata filters."""
from functools import lru_cache

import lancedb
import pyarrow as pa

from core.config import LANCEDB_DIR
from core.embed import EMBED_DIM, embed

TABLE = "chunks"

SCHEMA = pa.schema([
    pa.field("chunk_id", pa.int64()),
    pa.field("item_id", pa.int64()),
    pa.field("subject", pa.string()),
    pa.field("source_label", pa.string()),
    pa.field("text", pa.string()),
    pa.field("ts_start", pa.float64()),
    pa.field("page", pa.int64()),
    pa.field("image_path", pa.string()),
    pa.field("vector", pa.list_(pa.float32(), EMBED_DIM)),
])


@lru_cache(maxsize=1)
def _table():
    db = lancedb.connect(str(LANCEDB_DIR))
    if TABLE in db.table_names():
        return db.open_table(TABLE)
    return db.create_table(TABLE, schema=SCHEMA)


def add_chunks(rows: list[dict]):
    """rows: chunk_id, item_id, subject, source_label, text, ts_start, page, image_path."""
    if not rows:
        return
    vectors = embed([r["text"] for r in rows])
    for r, v in zip(rows, vectors):
        r["vector"] = v
        r.setdefault("ts_start", None)
        r.setdefault("page", None)
        r.setdefault("image_path", None)
    _table().add(rows)


def search(query: str, subject: str | None = None, k: int = 8) -> list[dict]:
    q = _table().search(embed([query])[0])
    if subject:
        q = q.where(f"subject = '{subject.replace(chr(39), chr(39)*2)}'")
    return q.limit(k).to_list()
