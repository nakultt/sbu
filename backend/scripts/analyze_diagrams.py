#!/usr/bin/env python3
"""Analyze diagram images locally and optionally publish results to Notes."""
from __future__ import annotations

import argparse
import shutil
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core import db  # noqa: E402
from core.config import FIGURES_DIR, FILES_DIR  # noqa: E402
from core.diagrams import analyze_diagram, diagram_markdown  # noqa: E402


def publish(source: Path, result: dict) -> int:
    db.init_db()
    stored = FILES_DIR / f"diagram_{uuid.uuid4().hex[:10]}_{source.name}"
    shutil.copy2(source, stored)
    item_id = db.add_item(source.name, str(stored), "image")
    subject_id = db.get_or_create_subject("Diagram analysis")
    with db.conn() as connection:
        connection.execute(
            "UPDATE items SET status='done', title=?, subject_id=?, processed_at=? WHERE id=?",
            (result["graph"]["title"], subject_id, time.time(), item_id),
        )
    original_path = FIGURES_DIR / f"diagram_{item_id}_original.png"
    overlay_path = FIGURES_DIR / f"diagram_{item_id}_overlay.png"
    shutil.copy2(source, original_path)
    shutil.copy2(result["overlay"], overlay_path)
    db.add_doc_figure(item_id, None, "Original diagram", str(original_path))
    db.add_doc_figure(item_id, None, "Detected diagram nodes", str(overlay_path))
    markdown = diagram_markdown(
        result,
        f"/api/doc/figures/{original_path.name}",
        f"/api/doc/figures/{overlay_path.name}",
    )
    return db.add_note(item_id, markdown)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("images", nargs="+", type=Path)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data" / "diagram-analysis")
    parser.add_argument("--publish-notes", action="store_true")
    args = parser.parse_args()
    for image in args.images:
        result = analyze_diagram(image, args.output_dir)
        print(f"\n{image.name}")
        print(result["mermaid"])
        print(f"JSON: {result['json_path']}")
        print(f"Overlay: {result['overlay']}")
        if args.publish_notes:
            print(f"Note ID: {publish(image.resolve(), result)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
