"""Central configuration. Everything comes from .env with sane local defaults."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

LMSTUDIO_BASE_URL = os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1")
LMSTUDIO_API_KEY = os.getenv("LMSTUDIO_API_KEY", "lm-studio")
LMSTUDIO_MODEL = os.getenv("LMSTUDIO_MODEL", "qwen/qwen3-4b")

STT_MODEL = os.getenv("STT_MODEL", "moonshine/base")
EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
KOKORO_VOICE = os.getenv("KOKORO_VOICE", "af_heart")

# Handwriting is transcribed by the vision model loaded in LM Studio. Point this
# at a specific model id if LM Studio serves several; defaults to the chat model.
VISION_MODEL = os.getenv("VISION_MODEL", LMSTUDIO_MODEL)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_ALLOWED_USER_IDS = {
    int(value.strip())
    for value in os.getenv("TELEGRAM_ALLOWED_USER_IDS", "").split(",")
    if value.strip().lstrip("-").isdigit()
}
TELEGRAM_ALLOWED_CHAT_IDS = {
    int(value.strip())
    for value in os.getenv("TELEGRAM_ALLOWED_CHAT_IDS", "").split(",")
    if value.strip().lstrip("-").isdigit()
}
TELEGRAM_ALLOW_ALL = os.getenv("TELEGRAM_ALLOW_ALL", "").lower() in {"1", "true", "yes"}
TELEGRAM_MAX_UPLOAD_MB = max(1, int(os.getenv("TELEGRAM_MAX_UPLOAD_MB", "20")))

GOOGLE_CALENDAR_CLIENT_ID = os.getenv("GOOGLE_CALENDAR_CLIENT_ID", "")
GOOGLE_CALENDAR_CLIENT_SECRET = os.getenv("GOOGLE_CALENDAR_CLIENT_SECRET", "")
GOOGLE_CALENDAR_REDIRECT_URI = os.getenv(
    "GOOGLE_CALENDAR_REDIRECT_URI",
    "http://localhost:8010/api/calendar/google/callback",
)
GOOGLE_CALENDAR_TIMEZONE = os.getenv("GOOGLE_CALENDAR_TIMEZONE", "Asia/Kolkata")

DATA_DIR = ROOT / os.getenv("DATA_DIR", "data")
INBOX_DIR = ROOT / os.getenv("INBOX_DIR", "inbox")
FILES_DIR = DATA_DIR / "files"
LANCEDB_DIR = DATA_DIR / "lancedb"
AUDIOBOOKS_DIR = DATA_DIR / "audiobooks"
HANDWRITING_DIR = DATA_DIR / "handwriting"
HW_PAGES_DIR = HANDWRITING_DIR / "pages"
HW_CROPS_DIR = HANDWRITING_DIR / "crops"
VIDEO_DIR = DATA_DIR / "video"
VIDEO_FRAMES_DIR = VIDEO_DIR / "frames"
VIDEO_CROPS_DIR = VIDEO_DIR / "crops"
DB_PATH = DATA_DIR / "app.db"

for d in (DATA_DIR, INBOX_DIR, FILES_DIR, LANCEDB_DIR, AUDIOBOOKS_DIR,
          HANDWRITING_DIR, HW_PAGES_DIR, HW_CROPS_DIR, VIDEO_DIR,
          VIDEO_FRAMES_DIR, VIDEO_CROPS_DIR):
    d.mkdir(parents=True, exist_ok=True)

AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac"}
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".heic", ".webp", ".tiff", ".bmp"}
PDF_EXTS = {".pdf"}
TEXT_EXTS = {".txt", ".md"}


def kind_of(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext in AUDIO_EXTS:
        return "audio"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in IMAGE_EXTS:
        return "image"
    if ext in PDF_EXTS:
        return "pdf"
    if ext in TEXT_EXTS:
        return "text"
    return None
