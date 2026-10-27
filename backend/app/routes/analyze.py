"""
Analyze Route: Handles initial multimodal visual accessibility requests.

Validates image formats (JPEG, PNG, WEBP), enforces streaming upload size protection,
performs lightweight in-memory optimization, invokes Gemma 4 multimodal model,
caches the image in-memory for follow-up questions, and returns structured JSON responses.
"""

import logging
import os
import uuid
from typing import Optional
from fastapi import APIRouter, File, Form, Request, UploadFile, status
from pydantic import BaseModel, Field

from app.services.gemma_service import (
    GemmaAPIError,
    GemmaConfigurationError,
    GemmaServiceError,
    analyze_image_with_gemma,
)
from app.services.image_processor import (
    ImageValidationError,
    validate_and_process_image,
)
from app.services.session_store import get_session_store
from app.utils.errors import (
    ai_rate_limit_error,
    ai_timeout_error,
    auth_error,
    empty_question_error,
    expired_session_error,
    image_required_error,
    image_too_large_error,
    invalid_session_error,
    model_unavailable_error,
    server_error,
    unsupported_image_error,
)

logger = logging.getLogger("gemma-backend")

router = APIRouter(prefix="/api/analyze", tags=["Analyze"])

# Upload size limit from environment (default: 10 MB)
MAX_UPLOAD_BYTES: int = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024
STREAM_CHUNK_SIZE: int = 64 * 1024  # 64 KB read buffer


class AnalyzeResponse(BaseModel):
    success: bool = Field(True, description="Status of the analysis operation")
    answer: str = Field(..., description="Assistant response / description")
    session_id: str = Field(..., description="Unique UUID identifier for this session")


@router.get("/status")
async def get_analyze_status():
    """Verify analyze router health and in-memory session count."""
    store = get_session_store()
    return {
        "status": "ready",
        "message": "Analyze route is active.",
        "active_sessions": store.count(),
    }


async def _read_upload_stream_safely(image: UploadFile) -> bytes:
    """
    Read uploaded file in chunks with strict upper-bound byte tracking
    to prevent memory exhaustion from oversized payloads.
    """
    chunks = []
    total_bytes = 0

    while True:
        chunk = await image.read(STREAM_CHUNK_SIZE)
        if not chunk:
            break
        total_bytes += len(chunk)
        if total_bytes > MAX_UPLOAD_BYTES:
            logger.warning(f"Upload aborted: exceeded limit of {MAX_UPLOAD_BYTES} bytes.")
            raise image_too_large_error()
        chunks.append(chunk)

    return b"".join(chunks)


@router.post(
    "",
    response_model=AnalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze an image with an accessibility question",
    description="Accepts multipart/form-data with an image (JPEG, PNG, WEBP) and question, invokes Gemma 4, and returns assistant answer.",
)
async def analyze(
    request: Request,
    image: Optional[UploadFile] = File(None, description="Image file to analyze (JPEG, PNG, WEBP, max 10MB)"),
    question: Optional[str] = Form(None, description="Question or prompt about the visual scene"),
    session_id: Optional[str] = Form(None, description="Optional session UUID for follow-up questions"),
) -> AnalyzeResponse:
    # 1. Validate question is not empty
    clean_question = (question or "").strip()
    if not clean_question:
        raise empty_question_error()

    store = get_session_store()
    processed_bytes: Optional[bytes] = None
    preserved_mime_type: Optional[str] = None
    target_session_id = session_id.strip() if session_id else None

    # 2. Check early Content-Length header if provided by client/proxy
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            # Allow 1MB margin for multipart boundaries/form fields
            if int(content_length) > MAX_UPLOAD_BYTES + 1024 * 1024:
                raise image_too_large_error()
        except ValueError:
            pass

    # 3. Handle image input or retrieve cached image for follow-up questions
    if image is not None and getattr(image, "filename", None):
        # Read stream safely with memory limits
        raw_bytes = await _read_upload_stream_safely(image)
        if not raw_bytes or len(raw_bytes) == 0:
            raise image_required_error("Please capture an image and try again.")

        # Validate format (JPEG, PNG, WEBP) and apply lightweight in-memory optimization
        try:
            processed_bytes, preserved_mime_type = validate_and_process_image(
                raw_bytes=raw_bytes,
                content_type=image.content_type or "",
            )
        except ImageValidationError as exc:
            logger.warning(f"Image validation failed: {exc.message}")
            if exc.error_code == "IMAGE_TOO_LARGE":
                raise image_too_large_error(exc.message)
            elif exc.error_code == "UNSUPPORTED_IMAGE_FORMAT":
                raise unsupported_image_error(exc.message)
            else:
                from app.utils.errors import corrupted_image_error
                raise corrupted_image_error(exc.message)
        finally:
            await image.seek(0)

        # Generate fresh session ID if not continuing an existing session
        if not target_session_id:
            target_session_id = str(uuid.uuid4())

    elif target_session_id:
        # Retrieve cached image from in-memory session store
        session_status, cached_session = store.get_session_status(target_session_id)
        if session_status == "EXPIRED":
            raise expired_session_error()
        elif session_status == "INVALID" or not cached_session:
            raise invalid_session_error()

        processed_bytes = cached_session["image_bytes"]
        preserved_mime_type = cached_session["mime_type"]
        logger.info(f"Reusing in-memory cached image for follow-up session {target_session_id}")

    else:
        # Neither image nor session_id was provided
        raise image_required_error("Please capture an image and try again.")

    # 4. Invoke Gemma 4 multimodal service
    try:
        answer = await analyze_image_with_gemma(
            image_bytes=processed_bytes,
            mime_type=preserved_mime_type,
            question=clean_question,
        )
    except GemmaConfigurationError as exc:
        logger.error(f"Gemma configuration error: {exc.message}")
        if exc.error_code == "AUTHENTICATION_ERROR":
            raise auth_error(exc.message)
        else:
            raise model_unavailable_error(exc.message)
    except GemmaAPIError as exc:
        logger.error(f"Gemma API error: {exc.message}")
        if exc.error_code == "AI_TIMEOUT":
            raise ai_timeout_error(exc.message)
        elif exc.error_code == "RATE_LIMIT_EXCEEDED":
            raise ai_rate_limit_error(exc.message)
        else:
            from app.utils.errors import AppException
            raise AppException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                error_code="AI_ERROR",
                message=exc.message,
            )
    except GemmaServiceError as exc:
        logger.error(f"Gemma service error: {exc.message}")
        from app.utils.errors import _sanitize_text
        raise server_error(f"Gemma error: {_sanitize_text(exc.message)}")
    except Exception as exc:
        logger.error(f"Unexpected error during image analysis: {exc}", exc_info=True)
        from app.utils.errors import _sanitize_text
        raise server_error(f"Analysis error: {_sanitize_text(str(exc))}")


    # 5. Store/update session in memory for follow-up questions
    if store.get_session(target_session_id):
        store.add_interaction(target_session_id, clean_question, answer)
    else:
        store.save_session(
            session_id=target_session_id,
            image_bytes=processed_bytes,
            mime_type=preserved_mime_type,
            question=clean_question,
            answer=answer,
        )

    # 6. Return standardized JSON response
    return AnalyzeResponse(
        success=True,
        answer=answer,
        session_id=target_session_id,
    )
