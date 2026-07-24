"""LM Studio client (OpenAI-compatible) with tolerant JSON handling."""
import json
import re

from openai import OpenAI

from core.config import LMSTUDIO_API_KEY, LMSTUDIO_BASE_URL, LMSTUDIO_MODEL, VISION_MODEL

_client = OpenAI(base_url=LMSTUDIO_BASE_URL, api_key=LMSTUDIO_API_KEY)


def is_available() -> bool:
    try:
        _client.models.list()
        return True
    except Exception:
        return False


def chat(system: str, user: str, temperature: float = 0.3, max_tokens: int = 2048) -> str:
    resp = _client.chat.completions.create(
        model=LMSTUDIO_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    text = resp.choices[0].message.content or ""
    # strip <think> blocks some local models emit
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def chat_vision(prompt: str, images_b64: list[str], temperature: float = 0.0,
                max_tokens: int = 256, model: str | None = None) -> str:
    """Send a text prompt plus one or more base64 PNG images to the vision model."""
    content: list = [{"type": "text", "text": prompt}]
    for b64 in images_b64:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}"},
        })
    resp = _client.chat.completions.create(
        model=model or VISION_MODEL,
        messages=[{"role": "user", "content": content}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    text = resp.choices[0].message.content or ""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _extract_json(text: str):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?|\n?```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


def chat_json(system: str, user: str, max_tokens: int = 1024) -> dict:
    """One retry with a fix-your-JSON prompt, then raise."""
    raw = chat(system + " Respond with a single JSON object only, no prose.", user,
               temperature=0.1, max_tokens=max_tokens)
    try:
        return _extract_json(raw)
    except Exception:
        fixed = chat("You fix malformed JSON. Respond with the corrected JSON object only.",
                     raw, temperature=0.0, max_tokens=max_tokens)
        return _extract_json(fixed)
