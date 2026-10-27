"""
Tests for English and Tamil Bilingual Language Routing and Safeguards.
"""

from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
from PIL import Image
import io

from app.main import app
from app.prompts.accessibility import (
    detect_text_language,
    get_accessibility_system_instruction,
)
from app.services.session_store import get_session_store

client = TestClient(app)


def make_test_png() -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (10, 10), color="green")
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_detect_text_language():
    """Verify Tamil Unicode character detection and fallbacks."""
    # English questions
    assert detect_text_language("What is in front of me?") == "en"
    assert detect_text_language("Read the notice") == "en"
    assert detect_text_language("What color is it?") == "en"

    # Tamil questions (Unicode range \u0B80-\u0BFF)
    assert detect_text_language("என் முன்னால் என்ன இருக்கிறது?") == "ta"
    assert detect_text_language("அது என்ன நிறம்?") == "ta"
    assert detect_text_language("புதிய படம்") == "ta"
    assert detect_text_language("வணக்கம்") == "ta"

    # Explicit fallback
    assert detect_text_language("", fallback_lang="ta") == "ta"
    assert detect_text_language("Hello", fallback_lang="en") == "en"


def test_tamil_system_instruction():
    """Verify Tamil system instruction includes natural Tamil directives."""
    instruction = get_accessibility_system_instruction("ta")
    assert "TAMIL" in instruction
    assert "தமிழ்" in instruction
    assert "Respond entirely in natural Tamil" in instruction


def test_analyze_with_tamil_question():
    """Verify analyze route passes Tamil language when Tamil question is submitted."""
    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = "உங்கள் முன்னால் ஒரு பச்சை நிற பொருள் உள்ளது."
        files = {"image": ("scene.png", make_test_png(), "image/png")}
        resp = client.post(
            "/api/analyze",
            files=files,
            data={"question": "என் முன்னால் என்ன இருக்கிறது?", "language": "ta"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["answer"] == "உங்கள் முன்னால் ஒரு பச்சை நிற பொருள் உள்ளது."
        assert "session_id" in data

        # Verify language passed to analyze_image_with_gemma
        call_kwargs = mock_analyze.call_args.kwargs
        assert call_kwargs["language"] == "ta"


def test_follow_up_with_tamil_question():
    """Verify follow-up route handles Tamil follow-up question."""
    store = get_session_store()
    session_id = "test-tamil-session-123"
    store.save_session(
        session_id=session_id,
        image_bytes=make_test_png(),
        mime_type="image/png",
        question="என் முன்னால் என்ன இருக்கிறது?",
        answer="உங்கள் முன்னால் ஒரு மேசை உள்ளது.",
        language="ta",
    )

    with patch("app.routes.follow_up.analyze_follow_up_with_gemma", new_callable=AsyncMock) as mock_follow:
        mock_follow.return_value = "அது பச்சை நிறம்."
        resp = client.post(
            "/api/follow-up",
            json={"session_id": session_id, "question": "அது என்ன நிறம்?", "language": "ta"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["answer"] == "அது பச்சை நிறம்."

        call_kwargs = mock_follow.call_args.kwargs
        assert call_kwargs["language"] == "ta"
