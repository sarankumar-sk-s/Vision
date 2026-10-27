"""
Unit and integration tests for Gemma 4 multimodal service and API endpoint.
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from google.genai import errors, types

from app.main import app
from app.prompts.accessibility import (
    ACCESSIBILITY_SYSTEM_INSTRUCTION,
    get_accessibility_system_instruction,
)
from app.services.gemma_service import (
    GemmaAPIError,
    GemmaConfigurationError,
    analyze_image_with_gemma,
    analyze_image_with_gemma_sync,
    create_genai_client,
    get_gemini_api_key,
    get_gemma_model_name,
)

client = TestClient(app)


def test_accessibility_system_instruction_content():
    """Verify system instruction contains all required accessibility directives."""
    prompt = get_accessibility_system_instruction()
    assert prompt == ACCESSIBILITY_SYSTEM_INSTRUCTION
    assert "You are an accessibility assistant helping users understand visual information around them." in prompt
    assert "Answer the user's specific question using only information reasonably supported by the provided image." in prompt
    assert "Keep responses concise, clear and easy to understand when spoken aloud." in prompt
    assert "If important visual information is unclear, say that you are unsure rather than inventing details." in prompt
    assert "You are an environment and document understanding assistant, not a replacement for a cane, guide dog, mobility aid or safety-critical navigation system." in prompt


def test_missing_api_key_raises_configuration_error(monkeypatch):
    """Test that missing GEMINI_API_KEY raises a clean GemmaConfigurationError."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(GemmaConfigurationError) as exc_info:
        get_gemini_api_key()
    assert "GEMINI_API_KEY environment variable is not configured" in str(exc_info.value)


def test_missing_model_name_raises_configuration_error(monkeypatch):
    """Test that missing GEMMA_MODEL raises a clean GemmaConfigurationError and does not substitute."""
    monkeypatch.delenv("GEMMA_MODEL", raising=False)
    with pytest.raises(GemmaConfigurationError) as exc_info:
        get_gemma_model_name()
    assert "GEMMA_MODEL environment variable is not configured" in str(exc_info.value)
    assert "Model substitution is strictly disabled" in str(exc_info.value)


def test_empty_image_bytes_raises_value_error(monkeypatch):
    """Test validation prevents empty image bytes."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake_test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")
    with pytest.raises(ValueError) as exc_info:
        analyze_image_with_gemma_sync(b"", "image/png", "What is this?")
    assert "Image bytes cannot be empty" in str(exc_info.value)


def test_empty_question_raises_value_error(monkeypatch):
    """Test validation prevents empty question."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake_test_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")
    with pytest.raises(ValueError) as exc_info:
        analyze_image_with_gemma_sync(b"fake_image_bytes", "image/png", "   ")
    assert "Question cannot be empty" in str(exc_info.value)


import asyncio


def test_async_gemma_inference_success(monkeypatch):
    """Test successful async Gemma call and answer extraction."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-27b-it")

    mock_response = MagicMock()
    mock_response.text = "This is a clean wooden desk with a blue coffee mug."

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    answer = asyncio.run(
        analyze_image_with_gemma(
            image_bytes=b"sample_image_data",
            mime_type="image/jpeg",
            question="What is on the desk?",
            client=mock_client,
        )
    )

    assert answer == "This is a clean wooden desk with a blue coffee mug."
    call_kwargs = mock_client.aio.models.generate_content.call_args.kwargs
    assert call_kwargs["model"] == "gemma-4-27b-it"
    assert len(call_kwargs["contents"]) == 2
    assert isinstance(call_kwargs["contents"][0], types.Part)
    assert call_kwargs["contents"][1] == "What is on the desk?"
    assert call_kwargs["config"].system_instruction == ACCESSIBILITY_SYSTEM_INSTRUCTION


def test_sync_gemma_inference_success(monkeypatch):
    """Test successful sync Gemma call."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    mock_response = MagicMock()
    mock_response.text = "Ahead is a pedestrian crossing with a green pedestrian signal."

    mock_client = MagicMock()
    mock_client.models.generate_content = MagicMock(return_value=mock_response)

    answer = analyze_image_with_gemma_sync(
        image_bytes=b"sample_crosswalk_bytes",
        mime_type="image/png",
        question="Can I safely cross?",
        client=mock_client,
    )

    assert answer == "Ahead is a pedestrian crossing with a green pedestrian signal."
    assert mock_client.models.generate_content.call_args.kwargs["model"] == "gemma-4-it"


def test_model_not_found_error_handling(monkeypatch):
    """Verify that a 404 NOT_FOUND APIError produces a clear configuration error."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key")
    monkeypatch.setenv("GEMMA_MODEL", "nonexistent-gemma-model")

    mock_error = errors.ClientError(
        404,
        {"error": {"code": 404, "message": "models/nonexistent-gemma-model is not found", "status": "NOT_FOUND"}}
    )


    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=mock_error)

    with pytest.raises(GemmaConfigurationError) as exc_info:
        asyncio.run(
            analyze_image_with_gemma(
                image_bytes=b"sample_data",
                mime_type="image/jpeg",
                question="What is here?",
                client=mock_client,
            )
        )

    assert "was not found or is unavailable" in str(exc_info.value)
    assert "nonexistent-gemma-model" in str(exc_info.value)



import io
from PIL import Image


def _create_valid_png() -> bytes:
    img = Image.new("RGB", (10, 10), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_api_endpoint_missing_config_returns_503(monkeypatch):
    """When GEMINI_API_KEY or GEMMA_MODEL is missing, /api/analyze returns 503 Service Unavailable."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMMA_MODEL", raising=False)

    files = {"image": ("test.png", _create_valid_png(), "image/png")}
    data = {"question": "Describe what is in front of me"}

    response = client.post("/api/analyze", files=files, data=data)
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"] or "GEMMA_MODEL" in response.json()["detail"]


def test_api_endpoint_success_with_gemma(monkeypatch):
    """Test full /api/analyze request through FastAPI with mocked Gemma service response."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-4-it")

    with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = "The document is a utility bill with a total amount of $45.20 due on Nov 15."

        files = {"image": ("bill.png", _create_valid_png(), "image/png")}
        data = {"question": "What is the bill amount?"}

        response = client.post("/api/analyze", files=files, data=data)
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["answer"] == "The document is a utility bill with a total amount of $45.20 due on Nov 15."
        assert "session_id" in payload

