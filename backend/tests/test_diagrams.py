import unittest

from core.diagrams import graph_to_mermaid, validate_graph


class DiagramValidationTests(unittest.TestCase):
    def test_normalizes_ids_and_drops_invalid_and_duplicate_edges(self):
        graph, messages = validate_graph({
            "is_diagram": True,
            "title": "Flow",
            "nodes": [
                {"id": "Start Here", "label": "Start", "shape": "rounded", "bbox": [1, 2, 3, 4]},
                {"id": "Done", "label": "Done", "shape": "rectangle", "bbox": [5, 6, 7, 8]},
            ],
            "edges": [
                {"from": "Start Here", "to": "Done", "label": ""},
                {"from": "Start Here", "to": "Done", "label": ""},
                {"from": "missing", "to": "Done", "label": ""},
            ],
        })
        self.assertEqual([n["id"] for n in graph["nodes"]], ["start_here", "done"])
        self.assertEqual(graph["edges"], [{"from": "start_here", "to": "done", "label": ""}])
        self.assertTrue(any("duplicate" in message.lower() for message in messages))
        self.assertTrue(any("unknown endpoint" in message.lower() for message in messages))

    def test_mermaid_escapes_labels_and_uses_shapes(self):
        mermaid = graph_to_mermaid({
            "nodes": [{"id": "decision", "label": 'Laptop "available"?', "shape": "diamond"}],
            "edges": [],
        })
        self.assertIn("decision{\"Laptop 'available'?\"}", mermaid)


if __name__ == "__main__":
    unittest.main()
