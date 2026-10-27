"""
Comprehensive test suite for Phase 4: POST /api/analyze pipeline.

Tests required cases:
1. Valid image + question (JPEG, PNG, WEBP)
2. Empty question
3. Missing image
4. Non-image file (and unsupported formats)
5. Gemma API failure
6. Follow-up interaction with in-memory session image reuse
7. Image resizing / compression in memory
"""

import io
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.gemma_service import GemmaAPIError, GemmaConfigurationError
from app.services.session_store import get_session_store

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_session_store():
    """Ensure in-memory sessions are cleared before each test."""
    store = get_session_store()
    store.clear()
    yield
    store.clear()


def make_test_image_bytes(format_name: str = "JPEG", size=(100, 100), color="blue") -> bytes:
    """Helper to generate binary image bytes in memory."""
    mode = "RGBA" if format_name == "PNG" else "RGB"
    img = Image.new(mode, size, color=color)
    buf = io.BytesIO()
    img.save(buf, format=format_name)
    return buf.getvalue()


# -----------------------------------------------------------------------------
# Case 1: Valid image + question
# -----------------------------------------------------------------------------
def test_valid_jpeg_image_and_question(monkeypatch):
    """Test valid JPEG image upload and question returns 200 with answer and session_id."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    jpeg_bytes = make_test_image_bytes("JPEG")

    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = "A bright blue square on a plain background."

        files = {"image": ("photo.jpg", jpeg_bytes, "image/jpeg")}
        data = {"question": "What is visible in this image?"}

        response = client.post("/api/analyze", files=files, data=data)

        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["answer"] == "A bright blue square on a plain background."
        assert "session_id" in payload
        assert len(payload["session_id"]) > 0

        # Verify MIME type and image bytes were preserved and forwarded
        forwarded_bytes, forwarded_mime = mock_analyze.call_args.kwargs["image_bytes"], mock_analyze.call_args.kwargs["mime_type"]
        assert forwarded_mime == "image/jpeg"
        assert len(forwarded_bytes) > 0


def test_valid_png_and_webp_formats(monkeypatch):
    """Test that PNG and WEBP MIME types are properly accepted and processed."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    for fmt, mime in [("PNG", "image/png"), ("WEBP", "image/webp")]:
        img_bytes = make_test_image_bytes(fmt)
        with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
            mock_analyze.return_value = f"Detected {fmt} graphic."

            files = {"image": (f"test.{fmt.lower()}", img_bytes, mime)}
            data = {"question": f"Is this a {fmt}?"}

            response = client.post("/api/analyze", files=files, data=data)
            assert response.status_code == 200
            assert response.json()["success"] is True
            assert mock_analyze.call_args.kwargs["mime_type"] == mime


# -----------------------------------------------------------------------------
# Case 2: Empty question
# -----------------------------------------------------------------------------
def test_empty_question_returns_400():
    """Verify empty or whitespace-only question returns a concise 400 Bad Request error."""
    jpeg_bytes = make_test_image_bytes("JPEG")
    files = {"image": ("test.jpg", jpeg_bytes, "image/jpeg")}

    for empty_q in ["", "   ", "\t\n"]:
        response = client.post("/api/analyze", files=files, data={"question": empty_q})
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert data["error"] == "EMPTY_QUESTION"
        assert "question" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 3: Missing image
# -----------------------------------------------------------------------------
def test_missing_image_returns_400():
    """Verify omitting the image returns a concise 400 Bad Request error."""
    response = client.post("/api/analyze", data={"question": "What is in front of me?"})
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"] == "IMAGE_REQUIRED"
    assert "image" in data["message"].lower()


def test_empty_image_payload_returns_400():
    """Verify zero-byte image file returns a concise 400 Bad Request error."""
    files = {"image": ("empty.jpg", b"", "image/jpeg")}
    response = client.post("/api/analyze", files=files, data={"question": "What is this?"})
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"] == "IMAGE_REQUIRED"


# -----------------------------------------------------------------------------
# Case 4: Non-image file and unsupported format
# -----------------------------------------------------------------------------
def test_non_image_file_with_text_mime_returns_400():
    """Verify uploading a plain text file is rejected by MIME validation."""
    files = {"image": ("document.txt", b"This is plain text.", "text/plain")}
    response = client.post("/api/analyze", files=files, data={"question": "Read this"})
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"] == "UNSUPPORTED_IMAGE_FORMAT"


def test_corrupted_or_spoofed_image_returns_400():
    """Verify uploading non-image data with image/jpeg header is detected and rejected."""
    files = {"image": ("fake.jpg", b"NOT AN IMAGE FILE AT ALL", "image/jpeg")}
    response = client.post("/api/analyze", files=files, data={"question": "Describe this"})
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"] == "CORRUPTED_IMAGE"


def test_gif_format_is_rejected():
    """Verify GIF format is explicitly rejected in Phase 4 (JPEG, PNG, WEBP only)."""
    # Create minimal GIF header bytes
    gif_bytes = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
    files = {"image": ("animation.gif", gif_bytes, "image/gif")}
    response = client.post("/api/analyze", files=files, data={"question": "What is this?"})
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert data["error"] == "UNSUPPORTED_IMAGE_FORMAT"



# -----------------------------------------------------------------------------
# Case 5: Gemma API failure
# -----------------------------------------------------------------------------
def test_gemma_api_error_returns_502(monkeypatch):
    """Verify Gemma API failures return a clean 502 Bad Gateway response."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    jpeg_bytes = make_test_image_bytes("JPEG")

    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.side_effect = GemmaAPIError("Gemini API quota exceeded.")

        files = {"image": ("photo.jpg", jpeg_bytes, "image/jpeg")}
        data = {"question": "Describe scene"}

        response = client.post("/api/analyze", files=files, data=data)
        assert response.status_code == 502
        assert "Gemini API quota exceeded" in response.json()["detail"]


def test_gemma_missing_config_returns_503(monkeypatch):
    """Verify unconfigured Gemma model returns a 503 Service Unavailable response."""
    monkeypatch.delenv("GEMMA_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    jpeg_bytes = make_test_image_bytes("JPEG")
    files = {"image": ("photo.jpg", jpeg_bytes, "image/jpeg")}
    data = {"question": "Describe scene"}

    response = client.post("/api/analyze", files=files, data=data)
    assert response.status_code == 503
    assert "GEMMA_MODEL" in response.json()["detail"] or "GEMINI_API_KEY" in response.json()["detail"]


# -----------------------------------------------------------------------------
# Case 6: In-memory session store for follow-up questions
# -----------------------------------------------------------------------------
def test_follow_up_question_reuses_cached_image(monkeypatch):
    """Test follow-up query reusing in-memory cached image without re-uploading file."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    jpeg_bytes = make_test_image_bytes("JPEG")

    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        # Step 1: Initial upload with image + question
        mock_analyze.return_value = "There is a coffee cup and a laptop on the table."
        res1 = client.post(
            "/api/analyze",
            files={"image": ("desk.jpg", jpeg_bytes, "image/jpeg")},
            data={"question": "What is on the table?"},
        )
        assert res1.status_code == 200
        session_id = res1.json()["session_id"]

        # Step 2: Follow-up question with session_id but NO image file
        mock_analyze.return_value = "The coffee cup is red."
        res2 = client.post(
            "/api/analyze",
            data={
                "question": "What color is the coffee cup?",
                "session_id": session_id,
            },
        )
        assert res2.status_code == 200
        payload2 = res2.json()
        assert payload2["success"] is True
        assert payload2["answer"] == "The coffee cup is red."
        assert payload2["session_id"] == session_id

        # Verify the cached image was forwarded to the model on the follow-up
        assert mock_analyze.call_args.kwargs["question"] == "What color is the coffee cup?"
        assert mock_analyze.call_args.kwargs["mime_type"] == "image/jpeg"
        assert len(mock_analyze.call_args.kwargs["image_bytes"]) > 0


def test_follow_up_with_expired_session_returns_404():
    """Verify follow-up with invalid or expired session_id returns 404."""
    response = client.post(
        "/api/analyze",
        data={
            "question": "Is the light green?",
            "session_id": "non-existent-uuid-1234",
        },
    )
    assert response.status_code == 404
    data = response.json()
    assert data["success"] is False
    assert data["error"] in ("INVALID_SESSION", "SESSION_EXPIRED")
    assert "session" in data["message"].lower()


# -----------------------------------------------------------------------------
# Case 7: In-memory image resizing
# -----------------------------------------------------------------------------
def test_large_image_is_downsampled_in_memory(monkeypatch):
    """Verify oversized image is automatically downscaled without permanent disk writes."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    # Generate oversized 3000x2000 JPEG
    oversized_bytes = make_test_image_bytes("JPEG", size=(3000, 2000))

    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = "Analyzed resized landscape."

        files = {"image": ("panorama.jpg", oversized_bytes, "image/jpeg")}
        data = {"question": "Describe landscape"}

        response = client.post("/api/analyze", files=files, data=data)
        assert response.status_code == 200

        forwarded_bytes = mock_analyze.call_args.kwargs["image_bytes"]
        # Verify forwarded image has dimensions <= 1568
        with Image.open(io.BytesIO(forwarded_bytes)) as decoded:
            w, h = decoded.size
            assert max(w, h) <= 1568
            assert decoded.format == "JPEG"
