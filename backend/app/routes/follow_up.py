"""
Follow-up Route: Handles conversational follow-up questions using cached images.

Accepts JSON with session_id and a question, retrieves the temporary in-memory image
and minimal conversation context, sends them to Gemma 4, updates the session context,
and returns the assistant's answer without capturing or requiring a new image.
"""

import logging
from typing import Optional
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.prompts.accessibility import detect_text_language
from app.services.gemma_service import (
    GemmaAPIError,
    GemmaConfigurationError,
    GemmaServiceError,
    analyze_follow_up_with_gemma,
)
from app.services.session_store import get_session_store
from app.utils.errors import (
    AppException,
    ai_rate_limit_error,
    ai_timeout_error,
    auth_error,
    empty_question_error,
    expired_session_error,
    invalid_session_error,
    model_unavailable_error,
    server_error,
)

logger = logging.getLogger("gemma-backend")

router = APIRouter(prefix="/api/follow-up", tags=["Follow-Up"])


class FollowUpRequest(BaseModel):
    session_id: str = Field(..., description="Active session ID from previous image analysis")
    question: str = Field(..., description="Follow-up question about the visual scene")
    language: Optional[str] = Field("en", description="Target response language ('en' or 'ta')")


class FollowUpResponse(BaseModel):
    success: bool = Field(True, description="Status of follow-up operation")
    answer: str = Field(..., description="Assistant answer to follow-up question")


@router.get("/status")
async def get_follow_up_status():
    """Verify follow-up route health and current active in-memory sessions."""
    store = get_session_store()
    return {
        "status": "ready",
        "message": "Follow-up route is active.",
        "active_sessions": store.count(),
    }


@router.post(
    "",
    response_model=FollowUpResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask a follow-up question about an existing session image",
    description="Reuses the cached in-memory image associated with session_id to answer follow-up questions.",
)
async def follow_up(request: FollowUpRequest) -> FollowUpResponse:
    # 1. Validate session_id
    clean_session_id = (request.session_id or "").strip()
    if not clean_session_id:
        raise invalid_session_error(
            message="The session_id field cannot be empty.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # 2. Validate question
    clean_question = (request.question or "").strip()
    if not clean_question:
        raise empty_question_error()

    store = get_session_store()

    # 3. Retrieve temporary in-memory session image and conversation history
    session_status, session = store.get_session_status(clean_session_id)
    if session_status == "EXPIRED":
        logger.warning(f"Follow-up request rejected: session '{clean_session_id}' has expired.")
        raise expired_session_error()
    elif session_status == "INVALID" or not session:
        logger.warning(f"Follow-up request rejected: session '{clean_session_id}' not found.")
        raise invalid_session_error()

    cached_image_bytes = session["image_bytes"]
    cached_mime_type = session["mime_type"]
    history = session.get("history", [])

    logger.info(
        f"Processing follow-up for session '{clean_session_id}' "
        f"with {len(history)} prior turns using cached image."
    )

    # 4. Invoke Gemma 4 multimodal service reusing cached image + context
    requested_lang = request.language or session.get("language", "en")
    resolved_lang = detect_text_language(clean_question, requested_lang)

    try:
        answer = await analyze_follow_up_with_gemma(
            image_bytes=cached_image_bytes,
            mime_type=cached_mime_type,
            question=clean_question,
            history=history,
            language=resolved_lang,
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
            raise AppException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                error_code="AI_ERROR",
                message=exc.message,
            )
    except GemmaServiceError as exc:
        logger.error(f"Gemma service error: {exc.message}")
        raise server_error()
    except Exception as exc:
        logger.error(f"Unexpected error during follow-up inference: {exc}", exc_info=True)
        raise server_error()


    # 5. Update session conversation context in memory
    store.add_interaction(
        session_id=clean_session_id,
        question=clean_question,
        answer=answer,
    )

    # 6. Return standard follow-up response
    return FollowUpResponse(
        success=True,
        answer=answer,
    )
