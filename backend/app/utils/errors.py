"""
Standardized error types and voice-friendly accessibility error messages.

Consistent error response structure:
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human and speech-friendly message.",
  "detail": "Human and speech-friendly message."
}
"""

import os
from typing import Any, Dict
from fastapi import HTTPException, status


def _sanitize_text(text: str) -> str:
    """Ensure raw GEMINI_API_KEY is never leaked in client responses."""
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if api_key and len(api_key) > 5 and api_key in text:
        return text.replace(api_key, "[REDACTED_API_KEY]")
    return text


class AppException(HTTPException):
    """
    Standard application exception providing structured error responses
    with messages optimized for both UI display and Text-to-Speech (TTS).
    """

    def __init__(self, status_code: int, error_code: str, message: str):
        sanitized_msg = _sanitize_text(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = sanitized_msg
        detail: Dict[str, Any] = {
            "success": False,
            "error": error_code,
            "message": sanitized_msg,
            "detail": sanitized_msg,
        }
        super().__init__(status_code=status_code, detail=detail)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": False,
            "error": self.error_code,
            "message": self.message,
            "detail": self.message,
        }


# Standard Error Factories
def image_required_error(
    message: str = "Image file is required. Please capture an image and try again."
) -> AppException:
    return AppException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code="IMAGE_REQUIRED",
        message=message,
    )


def unsupported_image_error(
    message: str = "Unsupported image format. Allowed formats: JPEG, PNG, WEBP."
) -> AppException:
    return AppException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code="UNSUPPORTED_IMAGE_FORMAT",
        message=message,
    )


def image_too_large_error(
    message: str = "The image is too large. Image file exceeds the maximum size limit of 10 MB."
) -> AppException:
    return AppException(
        status_code=getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413),
        error_code="IMAGE_TOO_LARGE",
        message=message,
    )


def corrupted_image_error(
    message: str = "The uploaded file is not a valid or readable image. Please capture a clearer photo and try again."
) -> AppException:
    return AppException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code="CORRUPTED_IMAGE",
        message=message,
    )


def empty_question_error(
    message: str = "The question field cannot be empty. Please ask what you would like to know."
) -> AppException:
    return AppException(
        status_code=status.HTTP_400_BAD_REQUEST,
        error_code="EMPTY_QUESTION",
        message=message,
    )


def invalid_session_error(
    message: str = "Session expired or not found. A new image scan is required.",
    status_code: int = status.HTTP_404_NOT_FOUND,
) -> AppException:
    return AppException(
        status_code=status_code,
        error_code="INVALID_SESSION",
        message=message,
    )


def expired_session_error(
    message: str = "Your session has expired. A new image scan is required."
) -> AppException:
    return AppException(
        status_code=status.HTTP_404_NOT_FOUND,
        error_code="SESSION_EXPIRED",
        message=message,
    )


def ai_timeout_error(
    message: str = "The visual assistant took too long to respond. Please try asking again."
) -> AppException:
    return AppException(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        error_code="AI_TIMEOUT",
        message=message,
    )


def ai_rate_limit_error(
    message: str = "Gemini API rate limit or quota exceeded. The visual assistant is currently busy, please try again shortly."
) -> AppException:
    return AppException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        error_code="RATE_LIMIT_EXCEEDED",
        message=message,
    )


def auth_error(
    message: str = "The assistant service could not authenticate. Please verify your GEMINI_API_KEY in backend settings."
) -> AppException:
    return AppException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        error_code="AUTHENTICATION_ERROR",
        message=message,
    )


def model_unavailable_error(
    message: str = "The configured visual model is currently unavailable. Please verify the GEMMA_MODEL configuration in backend settings."
) -> AppException:
    return AppException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        error_code="MODEL_UNAVAILABLE",
        message=message,
    )


def server_error(
    message: str = "An unexpected server error occurred. Please try again in a few moments."
) -> AppException:
    return AppException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code="SERVER_ERROR",
        message=message,
    )
