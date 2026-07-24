import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import server
from core import db


class UploadApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.original_db_path = db.DB_PATH
        db.DB_PATH = self.root / "test.db"
        db.init_db()
        self.files_patch = patch.object(server, "FILES_DIR", self.root / "files")
        self.files_patch.start().mkdir(parents=True)
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        self.files_patch.stop()
        db.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_audio_webm_recording_is_queued_as_audio(self):
        response = self.client.post(
            "/api/upload",
            files={"files": ("live-recording.webm", b"webm audio bytes", "audio/webm")},
            data={"text": ""},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["items"][0]["kind"], "audio")
        self.assertEqual(db.list_items()[0]["kind"], "audio")

    def test_video_webm_upload_remains_video(self):
        response = self.client.post(
            "/api/upload",
            files={"files": ("lecture.webm", b"webm video bytes", "video/webm")},
            data={"text": ""},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"][0]["kind"], "video")
        self.assertEqual(db.list_items()[0]["kind"], "video")

    @patch("server._answer_question")
    @patch("core.stt.transcribe_media")
    def test_audio_question_is_transcribed_then_sent_to_ask_flow(self, transcribe, answer):
        transcribe.return_value = [
            {"start": 0.2, "end": 1.0, "text": "What is"},
            {"start": 1.1, "end": 2.0, "text": "superposition?"},
        ]
        answer.return_value = {"answer": "A cited answer", "sources": [], "images": [], "videos": []}

        response = self.client.post(
            "/api/ask/audio",
            files={"audio": ("question.webm", b"webm audio bytes", "audio/webm")},
            data={"subject": " Electronic System Design "},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["transcript"], "What is superposition?")
        answer.assert_called_once_with("What is superposition?", "Electronic System Design")

    @patch("server.rag.ask", side_effect=RuntimeError("model unavailable"))
    @patch("server.flashcards.maybe_create_from_chat", return_value=None)
    def test_ask_failure_returns_json_without_orphaning_chat(self, _flashcards, _ask):
        response = self.client.post("/api/ask", json={"question": "What is KVL?", "subject": None})

        self.assertEqual(response.status_code, 503)
        self.assertIn("local AI", response.json()["detail"])
        self.assertEqual(db.list_chat_turns(), [])


if __name__ == "__main__":
    unittest.main()
