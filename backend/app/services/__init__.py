"""
Services package: for Gemma model calls and business logic.
"""

from app.services.gemma_service import (
    GemmaAPIError,
    GemmaConfigurationError,
    GemmaServiceError,
    analyze_image_with_gemma,
    analyze_image_with_gemma_sync,
    analyze_follow_up_with_gemma,
    create_genai_client,
    get_gemini_api_key,
    get_gemma_model_name,
)


from app.services.image_processor import (
    ImageValidationError,
    validate_and_process_image,
)
from app.services.session_store import (
    InMemorySessionStore,
    get_session_store,
    session_store,
)

__all__ = [
    "GemmaAPIError",
    "GemmaConfigurationError",
    "GemmaServiceError",
    "ImageValidationError",
    "InMemorySessionStore",
    "analyze_image_with_gemma",
    "analyze_image_with_gemma_sync",
    "analyze_follow_up_with_gemma",
    "create_genai_client",
    "get_gemini_api_key",
    "get_gemma_model_name",
    "get_session_store",
    "session_store",
    "validate_and_process_image",
]



