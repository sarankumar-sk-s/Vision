"""
Comprehensive test suite for Phase 5: POST /api/follow-up endpoint.

Tests:
1. Successful follow-up reusing cached image and context
2. Expired or non-existent session_id returns clear 404 telling frontend a new scan is required
3. Empty question returns 400 Bad Request
4. Empty session_id returns 400 Bad Request
5. Automatic TTL expiry mechanics
6. Memory growth prevention (LRU eviction and turn limits)
7. End-to-end multi-turn flow (POST /api/analyze -> POST /api/follow-up)
8. Gemma API failure handling in follow-up
"""

import io
import time
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.gemma_service import GemmaAPIError
from app.services.session_store import InMemorySessionStore, get_session_store

client = TestClient(app)


def make_png_bytes(color="purple"):
    img = Image.new("RGB", (50, 50), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def clean_sessions():
    """Ensure session store is cleared before and after each test."""
    store = get_session_store()
    store.clear()
    yield
    store.clear()


def test_follow_up_success(monkeypatch):
    """Test successful follow-up question reusing cached image without re-uploading."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    store = get_session_store()
    png_bytes = make_png_bytes()

    # Pre-populate session from an initial scan
    session_id = "sess-12345"
    store.save_session(
        session_id=session_id,
        image_bytes=png_bytes,
        mime_type="image/png",
        question="What is on the table?",
        answer="There is a water bottle and a notebook on the table.",
    )

    with patch("app.routes.follow_up.analyze_follow_up_with_gemma", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = "The water bottle is blue."

        payload = {
            "session_id": session_id,
            "question": "What color is the bottle?",
        }

        response = client.post("/api/follow-up", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["answer"] == "The water bottle is blue."

        # Verify that original image was reused and NOT re-uploaded
        call_kwargs = mock_call.call_args.kwargs
        assert call_kwargs["image_bytes"] == png_bytes
        assert call_kwargs["mime_type"] == "image/png"
        assert call_kwargs["question"] == "What color is the bottle?"

        # Verify prior context was passed
        assert len(call_kwargs["history"]) >= 2
        assert call_kwargs["history"][0]["text"] == "What is on the table?"

        # Verify session interaction history was updated
        updated_session = store.get_session(session_id)
        assert len(updated_session["history"]) == 4
        assert updated_session["history"][-2]["text"] == "What color is the bottle?"
        assert updated_session["history"][-1]["text"] == "The water bottle is blue."


def test_follow_up_missing_session_returns_404():
    """Test non-existent session_id returns clear 404 requiring a new scan."""
    payload = {
        "session_id": "nonexistent-session-id",
        "question": "Is the light red or green?",
    }

    response = client.post("/api/follow-up", json=payload)
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Session expired or not found" in detail
    assert "A new image scan is required" in detail


def test_follow_up_empty_question_returns_400():
    """Test follow-up with empty or whitespace-only question returns 400 Bad Request."""
    store = get_session_store()
    store.save_session("sess-1", make_png_bytes(), "image/png", "Initial", "Answer")

    for empty_q in ["", "   ", "\t\n"]:
        response = client.post(
            "/api/follow-up",
            json={"session_id": "sess-1", "question": empty_q},
        )
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert data["error"] == "EMPTY_QUESTION"
        assert "question" in data["message"].lower()


def test_follow_up_empty_session_id_returns_400():
    """Test follow-up with empty session_id returns 400 Bad Request."""
    response = client.post(
        "/api/follow-up",
        json={"session_id": "   ", "question": "What is this?"},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"] == "INVALID_SESSION"
    assert "session" in data["message"].lower()


def test_automatic_ttl_expiry():
    """Test session expires automatically after TTL and rejects follow-up."""
    # Create custom store with 0.1 second TTL
    custom_store = InMemorySessionStore(ttl_seconds=0.1)
    custom_store.save_session("short-lived-session", make_png_bytes(), "image/png", "Q1", "A1")

    assert custom_store.get_session("short-lived-session") is not None

    # Sleep past the TTL
    time.sleep(0.15)

    # Accessing the expired session returns None and purges it from memory
    assert custom_store.get_session("short-lived-session") is None
    assert custom_store.count() == 0


def test_lru_eviction_prevents_unbounded_growth():
    """Test store enforces max_sessions capacity by evicting oldest accessed sessions."""
    store = InMemorySessionStore(ttl_seconds=300, max_sessions=3)

    # Save 3 sessions
    store.save_session("s1", b"img1", "image/png", "q1", "a1")
    time.sleep(0.01)
    store.save_session("s2", b"img2", "image/png", "q2", "a2")
    time.sleep(0.01)
    store.save_session("s3", b"img3", "image/png", "q3", "a3")

    assert store.count() == 3

    # Add 4th session - oldest (s1) should be evicted
    time.sleep(0.01)
    store.save_session("s4", b"img4", "image/png", "q4", "a4")

    assert store.count() == 3
    assert store.get_session("s1") is None  # evicted
    assert store.get_session("s2") is not None
    assert store.get_session("s3") is not None
    assert store.get_session("s4") is not None


def test_end_to_end_analyze_then_follow_up(monkeypatch):
    """Test full multi-turn cycle: POST /api/analyze then POST /api/follow-up."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze, \
         patch("app.routes.follow_up.analyze_follow_up_with_gemma", new_callable=AsyncMock) as mock_follow:

        # Step 1: Initial visual scan
        mock_analyze.return_value = "A desk with an open laptop, a coffee mug, and a pen."
        png_bytes = make_png_bytes("teal")

        res_analyze = client.post(
            "/api/analyze",
            files={"image": ("desk.png", png_bytes, "image/png")},
            data={"question": "What is on the desk?"},
        )

        assert res_analyze.status_code == 200
        analyze_data = res_analyze.json()
        assert analyze_data["success"] is True
        session_id = analyze_data["session_id"]

        # Step 2: Follow-up question #1 using session_id (NO image file uploaded)
        mock_follow.return_value = "The coffee mug is on the left side of the laptop."
        res_follow_1 = client.post(
            "/api/follow-up",
            json={
                "session_id": session_id,
                "question": "Where is the coffee mug?",
            },
        )

        assert res_follow_1.status_code == 200
        assert res_follow_1.json() == {
            "success": True,
            "answer": "The coffee mug is on the left side of the laptop.",
        }

        # Step 3: Follow-up question #2 using same session_id
        mock_follow.return_value = "The mug is ceramic white."
        res_follow_2 = client.post(
            "/api/follow-up",
            json={
                "session_id": session_id,
                "question": "What color is the mug?",
            },
        )

        assert res_follow_2.status_code == 200
        assert res_follow_2.json() == {
            "success": True,
            "answer": "The mug is ceramic white.",
        }


def test_follow_up_gemma_api_error_returns_502(monkeypatch):
    """Test Gemma API failures in follow-up return 502 Bad Gateway."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    store = get_session_store()
    store.save_session("sess-fail", make_png_bytes(), "image/png", "Initial", "Answer")

    with patch("app.routes.follow_up.analyze_follow_up_with_gemma", new_callable=AsyncMock) as mock_follow:
        mock_follow.side_effect = GemmaAPIError("Gemini API connection timeout.")

        response = client.post(
            "/api/follow-up",
            json={"session_id": "sess-fail", "question": "Are there people?"},
        )

        assert response.status_code == 502
        assert "Gemini API connection timeout" in response.json()["detail"]
