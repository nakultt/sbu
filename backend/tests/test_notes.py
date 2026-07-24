import unittest

from core.ingest import _clean_generated_markdown


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


if __name__ == "__main__":
    unittest.main()
