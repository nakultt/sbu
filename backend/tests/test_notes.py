import unittest
import threading
from unittest.mock import patch

import core.ingest as ingest
from core.ingest import _assemble_structured_notes, _clean_generated_markdown, _extract


class PdfExtractionTests(unittest.TestCase):
    @patch(
        "core.ocr.extract_pdf",
        return_value=[{"page": 1, "text": "Ohm's law relates voltage and current."}],
    )
    def test_pdf_ingestion_uses_the_ocr_public_interface(self, extract_pdf):
        item = {"id": 42, "kind": "pdf", "stored_path": "/tmp/lecture.pdf"}

        chunks = _extract(item)

        extract_pdf.assert_called_once_with("/tmp/lecture.pdf")
        self.assertEqual(chunks[0]["page"], 1)
        self.assertIn("Ohm's law", chunks[0]["text"])

    def test_worker_logging_does_not_conflict_with_log_record_fields(self):
        stop = threading.Event()
        item = {"id": 42, "filename": "lecture.pdf"}

        def finish_processing(_item):
            stop.set()

        with (
            patch.object(ingest.db, "init_db"),
            patch.object(ingest, "_sweep_inbox"),
            patch.object(ingest.db, "claim_next_pending_item", return_value=item),
            patch.object(ingest, "process_item", side_effect=finish_processing) as process,
            patch.object(ingest.db, "set_status") as set_status,
        ):
            ingest.worker_loop(stop)

        process.assert_called_once_with(item)
        set_status.assert_not_called()


class ImageDiagramExtractionTests(unittest.TestCase):
    @patch("core.diagrams.analyze_diagram")
    def test_detected_diagram_uses_mermaid_pipeline(self, analyze):
        analyze.return_value = {
            "graph": {
                "is_diagram": True,
                "nodes": [{"id": "a", "label": "A"}],
                "title": "Detected flow",
                "summary": "A to B.",
            },
            "ocr_markdown": "A → B",
            "mermaid": "flowchart LR\n  a --> b",
            "stages": [],
        }
        item = {"id": 7, "kind": "image", "stored_path": "/tmp/screenshot.png"}

        chunks = _extract(item)

        analyze.assert_called_once_with("/tmp/screenshot.png")
        self.assertIn("```mermaid", chunks[0]["text"])
        self.assertEqual(chunks[0]["diagram_result"]["graph"]["title"], "Detected flow")

    @patch("core.ocr.ocr_image_annotations", return_value=[("ordinary photo text", 1.0, ())])
    @patch("core.diagrams.analyze_diagram")
    def test_non_diagram_falls_back_to_regular_image_ocr(self, analyze, annotations):
        analyze.return_value = {
            "graph": {"is_diagram": False, "nodes": []},
            "ocr_markdown": "",
            "mermaid": "flowchart LR",
            "stages": [],
        }
        item = {"id": 8, "kind": "image", "stored_path": "/tmp/photo.png"}

        chunks = _extract(item)

        self.assertEqual(chunks, [{"text": "ordinary photo text", "image_path": "/tmp/photo.png"}])
        annotations.assert_called_once_with("/tmp/photo.png")


class GenerateNotesVisualTests(unittest.TestCase):
    def setUp(self):
        self._orig = ingest.llm.chat

    def tearDown(self):
        ingest.llm.chat = self._orig

    def test_places_figure_inline_and_drops_appendix(self):
        ingest.llm.chat = lambda system, user, **kw: "## Summary\n\nThe flow is shown.\n\n[[FIG:1]]"
        visuals = [{
            "token_id": 1, "url": "/api/doc/figures/fig_1.png",
            "caption": "Flowchart", "anchor": ("page", 3),
        }]

        notes = ingest._generate_notes("[p. 3] source about the flow.",
                                       [{"text": "x", "page": 3}], "Title", visuals)

        self.assertIn("![Flowchart](/api/doc/figures/fig_1.png)", notes)
        self.assertNotIn("[[FIG:1]]", notes)
        self.assertNotIn("Important lecture visuals", notes)

    def test_unplaced_frame_falls_inline_near_timestamp(self):
        ingest.llm.chat = lambda system, user, **kw: "## Summary\n\nA lecture summary with no token."
        visuals = [{
            "token_id": 1, "url": "/api/video/frames/7/image",
            "caption": "Board", "anchor": ("ts", 12),
        }]
        chunks = [{"text": "[@ 0:12] talking here", "ts_start": 12.0}]

        notes = ingest._generate_notes("[@ 0:12] talking here", chunks, "Lec", visuals)

        self.assertIn("![Board](/api/video/frames/7/image)", notes)
        self.assertNotIn("Important lecture visuals", notes)

    def test_llm_selects_and_persists_important_term_highlights(self):
        calls = []

        def generate(system, user, **kwargs):
            calls.append((system, user))
            return "## Summary\n\n==Ohm's law== relates voltage and current."

        ingest.llm.chat = generate

        notes = ingest._generate_notes(
            "Ohm's law relates voltage and current.",
            [{"text": "Ohm's law relates voltage and current."}],
            "Circuits",
        )

        self.assertIn("==Ohm's law==", notes)
        self.assertIn("or a short sentence when the complete statement is important", calls[0][0])


class GeneratedNoteCleanupTests(unittest.TestCase):
    def test_removes_placeholder_references_but_preserves_real_sources_and_math(self):
        markdown = (
            "# Notes\n\nValue is $R_{TH}$ [@ mm:ss].\n\n"
            "Real source [@ 58:22]. Page placeholder [p. N]."
        )

        cleaned = _clean_generated_markdown(markdown)

        self.assertNotIn("mm:ss", cleaned)
        self.assertNotIn("p. N", cleaned)
        self.assertIn("$R_{TH}$", cleaned)
        self.assertIn("[@ 58:22]", cleaned)

    def test_normalizes_decorative_symbols_and_model_markdown_fence(self):
        markdown = "```markdown\n# Overview 📅\n\n• First point\n*   Second point ✅\n```"

        cleaned = _clean_generated_markdown(markdown)

        self.assertEqual(cleaned, "# Overview\n\n- First point\n- Second point")

    def test_removes_at_prefixed_page_placeholder(self):
        cleaned = _clean_generated_markdown("Definition [@ p. N].")

        self.assertEqual(cleaned, "Definition.")

    def test_assembles_one_title_and_merges_repeated_sections(self):
        assembled = _assemble_structured_notes(
            "  # Neural   Networks\nignored  ",
            [
                "# Model title\n\n## Summary\nFirst overview.\n\n## Key concepts\n- **Neuron:** unit",
                "## Summary\nSecond overview.\n\n## Detailed notes\n- Training detail",
            ],
        )

        self.assertEqual(assembled.count("# Neural Networks"), 1)
        self.assertEqual(assembled.count("## Summary"), 1)
        self.assertIn("First overview.\n\nSecond overview.", assembled)
        self.assertLess(assembled.index("## Key concepts"), assembled.index("## Detailed notes"))

    def test_assembles_unsectioned_model_output_as_detailed_notes(self):
        assembled = _assemble_structured_notes("Short source", ["- One factual point"])

        self.assertEqual(
            assembled,
            "# Short source\n\n## Detailed notes\n\n- One factual point",
        )


if __name__ == "__main__":
    unittest.main()
