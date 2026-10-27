"""
Tests for Phase 6: Reliability, Security, and Error Contract Hardening.

Covers all 11 required failure cases:
1. camera image missing (IMAGE_REQUIRED)
2. unsupported image (UNSUPPORTED_IMAGE_FORMAT)
3. image too large (IMAGE_TOO_LARGE)
4. empty question (EMPTY_QUESTION)
5. invalid session (INVALID_SESSION)
6. expired session (SESSION_EXPIRED)
7. Gemini/Gemma API timeout (AI_TIMEOUT)
8. API quota/rate-limit error (RATE_LIMIT_EXCEEDED)
9. invalid API key (AUTHENTICATION_ERROR)
10. model unavailable (MODEL_UNAVAILABLE)
11. unexpected server error (SERVER_ERROR)

Additionally verifies:
- Error responses have exact shape: {"success": false, "error": ..., "message": ...}
- No stack traces or GEMINI_API_KEY leakage in client responses
- CORS configuration behavior
"""

import io
import time
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.session_store import get_session_store
from app.services.gemma_service import (
    GemmaAPIError,
    GemmaConfigurationError,
)

client = TestClient(app)


def make_valid_png() -> bytes:
    """Generate a minimal valid 10x10 PNG."""
    buf = io.BytesIO()
    img = Image.new("RGB", (10, 10), color="blue")
    img.save(buf, format="PNG")
    return buf.getvalue()


# -----------------------------------------------------------------------------
# Case 1: Camera image missing
# -----------------------------------------------------------------------------
def test_case_1_camera_image_missing():
    """Verify missing image returns IMAGE_REQUIRED with speech-friendly message."""
    resp = client.post("/api/analyze", data={"question": "What is in front of me?"})
    assert resp.status_code == 400
    data = resp.json()
    assert data["success"] is False
    assert data["error"] == "IMAGE_REQUIRED"
    assert "image" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 2: Unsupported image format
# -----------------------------------------------------------------------------
def test_case_2_unsupported_image_format():
    """Verify non-supported format (text/plain) returns UNSUPPORTED_IMAGE_FORMAT."""
    files = {"image": ("test.txt", b"plain text content", "text/plain")}
    resp = client.post("/api/analyze", files=files, data={"question": "Read this"})
    assert resp.status_code == 400
    data = resp.json()
    assert data["success"] is False
    assert data["error"] == "UNSUPPORTED_IMAGE_FORMAT"
    assert "format" in data["message"].lower() or "jpeg" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 3: Image too large
# -----------------------------------------------------------------------------
def test_case_3_image_too_large(monkeypatch):
    """Verify payload exceeding MAX_UPLOAD_BYTES is rejected as IMAGE_TOO_LARGE."""
    # Temporarily set upload limit to 100 bytes for fast testing
    monkeypatch.setattr("app.routes.analyze.MAX_UPLOAD_BYTES", 100)
    oversized_data = b"x" * 150
    files = {"image": ("huge.jpg", oversized_data, "image/jpeg")}
    resp = client.post("/api/analyze", files=files, data={"question": "What is this?"})
    assert resp.status_code == 413
    data = resp.json()
    assert data["success"] is False
    assert data["error"] == "IMAGE_TOO_LARGE"
    assert "too large" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 4: Empty question
# -----------------------------------------------------------------------------
def test_case_4_empty_question():
    """Verify empty question on /api/analyze and /api/follow-up returns EMPTY_QUESTION."""
    png_bytes = make_valid_png()
    files = {"image": ("scene.png", png_bytes, "image/png")}
    resp = client.post("/api/analyze", files=files, data={"question": "   "})
    assert resp.status_code == 400
    data = resp.json()
    assert data["success"] is False
    assert data["error"] == "EMPTY_QUESTION"
    assert "question" in data["message"].lower()

    # Also test /api/follow-up
    resp2 = client.post("/api/follow-up", json={"session_id": "any-id", "question": ""})
    assert resp2.status_code == 400
    data2 = resp2.json()
    assert data2["success"] is False
    assert data2["error"] == "EMPTY_QUESTION"


# -----------------------------------------------------------------------------
# Case 5: Invalid session
# -----------------------------------------------------------------------------
def test_case_5_invalid_session():
    """Verify unknown session_id returns INVALID_SESSION."""
    resp = client.post(
        "/api/follow-up",
        json={"session_id": "totally-unknown-id", "question": "Where is the door?"},
    )
    assert resp.status_code == 404
    data = resp.json()
    assert data["success"] is False
    assert data["error"] == "INVALID_SESSION"
    assert "session" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 6: Expired session
# -----------------------------------------------------------------------------
def test_case_6_expired_session():
    """Verify expired session_id returns SESSION_EXPIRED asking user for a new scan."""
    store = get_session_store()
    # Save a session
    store.save_session("expired-id-123", make_valid_png(), "image/png", "Initial Q", "Initial A")
    # Manually backdate the last_accessed timestamp to simulate expiry
    store._sessions["expired-id-123"]["last_accessed"] = time.time() - 99999

    # Trigger check / status resolution
    status_str, _ = store.get_session_status("expired-id-123")
    assert status_str == "EXPIRED"

    resp = client.post(
        "/api/follow-up",
        json={"session_id": "expired-id-123", "question": "What was that again?"},
    )
    assert resp.status_code == 404
    data = resp.json()
    assert data["success"] is False
    assert data["error"] == "SESSION_EXPIRED"
    assert "expired" in data["message"].lower() or "new image" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 7: Gemini/Gemma API timeout
# -----------------------------------------------------------------------------
def test_case_7_api_timeout():
    """Verify Gemma API timeout returns 504 AI_TIMEOUT."""
    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.side_effect = GemmaAPIError("The AI service request timed out.", error_code="AI_TIMEOUT")
        files = {"image": ("scene.png", make_valid_png(), "image/png")}
        resp = client.post("/api/analyze", files=files, data={"question": "Describe this"})
        assert resp.status_code == 504
        data = resp.json()
        assert data["success"] is False
        assert data["error"] == "AI_TIMEOUT"
        assert "taking too long" in data["message"].lower() or "timed out" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 8: API quota/rate-limit error
# -----------------------------------------------------------------------------
def test_case_8_rate_limit_exceeded():
    """Verify Gemma rate limit returns 429 RATE_LIMIT_EXCEEDED."""
    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.side_effect = GemmaAPIError("Quota exceeded for quota metric.", error_code="RATE_LIMIT_EXCEEDED")
        files = {"image": ("scene.png", make_valid_png(), "image/png")}
        resp = client.post("/api/analyze", files=files, data={"question": "Describe this"})
        assert resp.status_code == 429
        data = resp.json()
        assert data["success"] is False
        assert data["error"] == "RATE_LIMIT_EXCEEDED"
        assert "busy" in data["message"].lower() or "quota" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 9: Invalid API key
# -----------------------------------------------------------------------------
def test_case_9_invalid_api_key():
    """Verify invalid or rejected API key returns 503 AUTHENTICATION_ERROR without leaking key."""
    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.side_effect = GemmaConfigurationError(
            "API key not valid. Please pass a valid API key.",
            error_code="AUTHENTICATION_ERROR",
        )
        files = {"image": ("scene.png", make_valid_png(), "image/png")}
        resp = client.post("/api/analyze", files=files, data={"question": "Describe this"})
        assert resp.status_code == 503
        data = resp.json()
        assert data["success"] is False
        assert data["error"] == "AUTHENTICATION_ERROR"
        # Must NOT leak any secret or raw key
        assert "AIza" not in resp.text


# -----------------------------------------------------------------------------
# Case 10: Model unavailable
# -----------------------------------------------------------------------------
def test_case_10_model_unavailable():
    """Verify unavailable Gemma model returns 503 MODEL_UNAVAILABLE."""
    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.side_effect = GemmaConfigurationError(
            "Configured Gemma model 'gemma-4-it' not found.",
            error_code="MODEL_UNAVAILABLE",
        )
        files = {"image": ("scene.png", make_valid_png(), "image/png")}
        resp = client.post("/api/analyze", files=files, data={"question": "Describe this"})
        assert resp.status_code == 503
        data = resp.json()
        assert data["success"] is False
        assert data["error"] == "MODEL_UNAVAILABLE"


# -----------------------------------------------------------------------------
# Case 11: Unexpected server error
# -----------------------------------------------------------------------------
def test_case_11_unexpected_server_error():
    """Verify unhandled internal exception returns 500 SERVER_ERROR without stack trace."""
    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        # Simulate unexpected crash with secret in exception text
        mock_analyze.side_effect = RuntimeError("Fatal internal bug with secret key: AIzaSyD987654321")
        files = {"image": ("scene.png", make_valid_png(), "image/png")}
        resp = client.post("/api/analyze", files=files, data={"question": "Describe this"})
        assert resp.status_code == 500
        data = resp.json()
        assert data["success"] is False
        assert data["error"] == "SERVER_ERROR"
        assert "server error" in data["message"].lower()

        # Security check: verify no tracebacks, file paths, or keys leaked
        assert "Traceback" not in resp.text
        assert "AIzaSyD987654321" not in resp.text
        assert "RuntimeError" not in resp.text


# -----------------------------------------------------------------------------
# Security & Privacy Tests
# -----------------------------------------------------------------------------
def test_sensitive_credentials_never_exposed_in_response(monkeypatch):
    """Verify GEMINI_API_KEY is scrubbed if it accidentally appears in an exception."""
    fake_key = "AIzaSyFakeSecretKeyForTesting123"
    monkeypatch.setenv("GEMINI_API_KEY", fake_key)

    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.side_effect = GemmaAPIError(f"Google API call failed for key {fake_key}")
        files = {"image": ("scene.png", make_valid_png(), "image/png")}
        resp = client.post("/api/analyze", files=files, data={"question": "Describe this"})
        assert fake_key not in resp.text
        assert "[REDACTED_API_KEY]" in resp.text or fake_key not in resp.text


# -----------------------------------------------------------------------------
# CORS Configuration Tests
# -----------------------------------------------------------------------------
def test_cors_preflight_allows_configured_origins():
    """Verify CORS preflight handles configured React origins correctly."""
    # Test localhost React dev server origin
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    }
    resp = client.options("/api/analyze", headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"

    # Test deployed Vercel frontend origin
    vercel_headers = {
        "Origin": "https://vision-dusky-xi.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    }
    vercel_resp = client.options("/api/analyze", headers=vercel_headers)
    assert vercel_resp.status_code == 200
    assert vercel_resp.headers.get("access-control-allow-origin") == "https://vision-dusky-xi.vercel.app"

    # Test Vercel preview domain via regex
    preview_headers = {
        "Origin": "https://vision-test-preview.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    }
    preview_resp = client.options("/api/analyze", headers=preview_headers)
    assert preview_resp.status_code == 200
    assert preview_resp.headers.get("access-control-allow-origin") == "https://vision-test-preview.vercel.app"
