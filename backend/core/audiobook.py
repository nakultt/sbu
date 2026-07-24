"""Audiobook generation: notes -> narration script (LLM) -> Kokoro TTS -> WAV."""
import re
import time
from functools import lru_cache
from pathlib import Path

import numpy as np
import soundfile as sf

from core import llm
from core.config import AUDIOBOOKS_DIR, KOKORO_VOICE

SCRIPT_SYSTEM = (
    "Rewrite the following study notes as a flowing narration script for an audiobook. "
    "Plain spoken prose only: no markdown, no headings, no bullet symbols, no source "
    "references. Explain naturally, as a good teacher would. Output only the script."
)

SAMPLE_RATE = 24000


@lru_cache(maxsize=1)
def _pipeline():
    from kokoro import KPipeline
    return KPipeline(lang_code="a")  # American English


def notes_to_script(notes_md: str) -> str:
    parts = []
    for i in range(0, len(notes_md), 4000):
        parts.append(llm.chat(SCRIPT_SYSTEM, notes_md[i:i + 4000], max_tokens=1500))
    return "\n\n".join(parts)


def synthesize(script: str, name: str) -> Path:
    pipeline = _pipeline()
    audio_parts = [audio for _, _, audio in pipeline(script, voice=KOKORO_VOICE)]
    audio = np.concatenate([np.asarray(a) for a in audio_parts])
    safe = re.sub(r"[^\w\-]+", "_", name).strip("_") or "audiobook"
    out = AUDIOBOOKS_DIR / f"{safe}_{int(time.time())}.wav"
    sf.write(out, audio, SAMPLE_RATE)
    return out


def generate(notes_md: str, name: str) -> Path:
    return synthesize(notes_to_script(notes_md), name)
