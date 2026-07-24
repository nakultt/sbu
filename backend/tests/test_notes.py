import unittest

import core.ingest as ingest
from core.ingest import _assemble_structured_notes, _clean_generated_markdown


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
