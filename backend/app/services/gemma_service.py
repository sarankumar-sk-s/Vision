"""
Gemma 4 Multimodal Service using the official Google GenAI Python SDK.

Handles secure client initialization, isolated model configuration,
prompt building, and clean error handling for image + text queries.
"""

import logging
import os
from typing import Optional
from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

from app.prompts.accessibility import (
    detect_text_language,
    get_accessibility_system_instruction,
)

# Ensure environment variables are loaded
load_dotenv()

logger = logging.getLogger("gemma-backend")


def _sanitize_message(message: str) -> str:
    """Scrub raw API key if it ever appears in an error string."""
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if api_key and len(api_key) > 5 and api_key in message:
        return message.replace(api_key, "[REDACTED_API_KEY]")
    return message


# Custom Exceptions
class GemmaServiceError(Exception):
    """Base exception for Gemma service failures."""
    def __init__(self, message: str, error_code: str = "SERVER_ERROR"):
        clean_msg = _sanitize_message(str(message))
        super().__init__(clean_msg)
        self.message = clean_msg
        self.error_code = error_code


class GemmaConfigurationError(GemmaServiceError):
    """Raised when API key or model configuration is missing or invalid."""
    def __init__(self, message: str, error_code: str = "CONFIG_ERROR"):
        super().__init__(message, error_code=error_code)


class GemmaAPIError(GemmaServiceError):
    """Raised when the Gemini / Google GenAI API returns an error or fails."""
    def __init__(self, message: str, error_code: str = "AI_ERROR"):
        super().__init__(message, error_code=error_code)


def get_gemini_api_key() -> str:
    """
    Retrieve and validate GEMINI_API_KEY from environment variables.
    Never exposes or logs the key value.
    """
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise GemmaConfigurationError(
            "GEMINI_API_KEY environment variable is not configured or is empty. "
            "Please set GEMINI_API_KEY in your .env file or server environment.",
            error_code="AUTHENTICATION_ERROR",
        )
    return api_key


def get_gemma_model_name() -> str:
    """
    Retrieve and validate GEMMA_MODEL from environment variables.
    Does NOT substitute or fallback to any default model to ensure strict
    isolation and prevent unexpected model routing during the hackathon.
    """
    model_name = (os.getenv("GEMMA_MODEL") or "").strip()
    if not model_name:
        raise GemmaConfigurationError(
            "GEMMA_MODEL environment variable is not configured or is empty. "
            "Configure GEMMA_MODEL with the exact Gemma 4 model identifier provided in the hackathon documentation. "
            "Model substitution is strictly disabled.",
            error_code="MODEL_UNAVAILABLE",
        )
    return model_name


DEFAULT_TIMEOUT_SECONDS: float = 30.0


def create_genai_client(
    api_key: Optional[str] = None,
    timeout_ms: int = int(DEFAULT_TIMEOUT_SECONDS * 1000),
) -> genai.Client:
    """
    Securely instantiate the official Google GenAI client.
    Uses the provided key or retrieves it from the environment.
    Sets a default connection-level timeout (in milliseconds) at client level.
    """
    resolved_key = api_key or get_gemini_api_key()
    try:
        return genai.Client(
            api_key=resolved_key,
            http_options=types.HttpOptions(timeout=timeout_ms),
        )
    except Exception as e:
        logger.error("Failed to initialize Google GenAI client.")
        raise GemmaConfigurationError(f"Failed to initialize Google GenAI client: {str(e)}") from e


import asyncio


from typing import Dict, List, Optional


def _format_contextual_prompt(
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    """
    Format minimal conversation context together with the follow-up question.
    Retains up to the last 4 exchanges (2 Q&A pairs) to keep context concise.
    """
    clean_q = (question or "").strip()
    if not clean_q:
        raise ValueError("Question cannot be empty.")
    if not history:
        return clean_q

    recent_turns = history[-4:]
    context_lines = []
    for turn in recent_turns:
        role = "User" if turn.get("role") in ("user", "human") else "Assistant"
        text = (turn.get("text") or "").strip()
        if text:
            context_lines.append(f"{role}: {text}")

    if not context_lines:
        return clean_q

    context_str = "\n".join(context_lines)
    return (
        f"Previous conversation context about this image:\n"
        f"{context_str}\n\n"
        f"User follow-up question: {clean_q}"
    )


def _prepare_generation_payload(
    image_bytes: bytes,
    mime_type: str,
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
    language: Optional[str] = "en",
    timeout: Optional[float] = None,
) -> tuple[list, types.GenerateContentConfig]:
    """
    Validate inputs and assemble multimodal contents and generation config.
    """
    if not image_bytes:
        raise ValueError("Image bytes cannot be empty.")
    if not mime_type or not mime_type.strip():
        raise ValueError("MIME type cannot be empty.")

    prompt_text = _format_contextual_prompt(question, history)

    # Multimodal payload: image Part + contextual text question
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type.strip().lower())
    contents = [image_part, prompt_text]

    # Accessibility system instruction with bilingual language routing
    resolved_lang = detect_text_language(question, language or "en")
    http_options = types.HttpOptions(timeout=int(timeout * 1000)) if timeout else None
    config = types.GenerateContentConfig(
        system_instruction=get_accessibility_system_instruction(resolved_lang),
        http_options=http_options,
    )

    return contents, config


def _extract_response_text(response, model_name: str) -> str:
    """Extract clean answer text from GenerateContentResponse."""
    try:
        if hasattr(response, "text") and response.text:
            return response.text.strip()
    except Exception:
        pass

    # Extract text directly from candidate parts (excluding thoughts)
    candidates = getattr(response, "candidates", None)
    if candidates and len(candidates) > 0:
        content = getattr(candidates[0], "content", None)
        if content and hasattr(content, "parts") and content.parts:
            text_parts = [
                part.text
                for part in content.parts
                if hasattr(part, "text") and part.text and not getattr(part, "thought", False)
            ]
            if text_parts:
                return "\n".join(text_parts).strip()
            # If all parts are thoughts, use the last text part
            fallback_parts = [
                part.text
                for part in content.parts
                if hasattr(part, "text") and part.text
            ]
            if fallback_parts:
                return fallback_parts[-1].strip()

        finish_reason = getattr(candidates[0], "finish_reason", None)
        raise GemmaAPIError(
            f"Gemma model '{model_name}' did not produce text output. Finish reason: {finish_reason}"
        )

    raise GemmaAPIError(f"Gemma model '{model_name}' returned an empty response.")



def _handle_api_error(err: Exception, model_name: str) -> None:
    """Categorize API errors into clear, actionable exceptions without leaking sensitive info."""
    code = getattr(err, "code", None)
    status_str = str(getattr(err, "status", "")).upper()
    raw_message = getattr(err, "message", str(err))
    message = _sanitize_message(raw_message)

    # Model not found / unavailable
    if code == 404 or "NOT_FOUND" in status_str or "not found" in message.lower():
        raise GemmaConfigurationError(
            f"Configured Gemma model '{model_name}' was not found or is unavailable via the Gemini API access. "
            f"Please verify GEMMA_MODEL in your configuration matches the hackathon model identifier. (Detail: {message})",
            error_code="MODEL_UNAVAILABLE",
        )

    # Authentication / permissions
    if code in (401, 403) or "UNAUTHENTICATED" in status_str or "PERMISSION_DENIED" in status_str or "invalid api key" in message.lower():
        raise GemmaConfigurationError(
            f"Gemini API authentication failed. Verify GEMINI_API_KEY is valid and authorized for model '{model_name}'. (Detail: {message})",
            error_code="AUTHENTICATION_ERROR",
        )

    # Quota / Rate limit
    if code == 429 or "RESOURCE_EXHAUSTED" in status_str or "quota" in message.lower() or "rate limit" in message.lower():
        raise GemmaAPIError(
            f"Gemini API rate limit or quota exceeded for model '{model_name}'. Please try again shortly. (Detail: {message})",
            error_code="RATE_LIMIT_EXCEEDED",
        )

    # Timeout
    if "timeout" in message.lower() or "timed out" in message.lower():
        raise GemmaAPIError(
            f"Gemma model '{model_name}' request timed out: {message}",
            error_code="AI_TIMEOUT",
        )

    # Other API errors
    raise GemmaAPIError(
        f"Gemini API error ({code or status_str or 'unknown'}): {message}",
        error_code="AI_ERROR",
    )


async def analyze_image_with_gemma(
    image_bytes: bytes,
    mime_type: str,
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
    language: Optional[str] = "en",
    model_name: Optional[str] = None,
    client: Optional[genai.Client] = None,
    timeout: Optional[float] = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    """
    Asynchronously analyze an image with a user accessibility question using Gemma 4 multimodal model.

    Args:
        image_bytes: Raw binary bytes of the image file.
        mime_type: MIME type of the image (e.g., 'image/jpeg', 'image/png', 'image/webp').
        question: User's accessibility query regarding the visual input.
        history: Optional previous Q&A exchanges for follow-up conversation context.
        language: Target response language ('en' or 'ta').
        model_name: Optional model override. Defaults strictly to GEMMA_MODEL environment variable.
        client: Optional pre-configured GenAI client.
        timeout: Maximum duration in seconds to wait for model response.

    Returns:
        The generated assistant answer string.
    """
    resolved_model = (model_name or get_gemma_model_name()).strip()
    effective_timeout = timeout or DEFAULT_TIMEOUT_SECONDS
    contents, config = _prepare_generation_payload(
        image_bytes,
        mime_type,
        question,
        history=history,
        language=language,
        timeout=effective_timeout,
    )
    active_client = client or create_genai_client()

    logger.info(f"Sending multimodal analysis request to Gemma model '{resolved_model}' (timeout={effective_timeout}s, lang={language})...")

    try:
        response = await asyncio.wait_for(
            active_client.aio.models.generate_content(
                model=resolved_model,
                contents=contents,
                config=config,
            ),
            timeout=effective_timeout,
        )
        return _extract_response_text(response, resolved_model)

    except asyncio.TimeoutError as exc:
        logger.error(f"Gemma model '{resolved_model}' request timed out after {effective_timeout}s.")
        raise GemmaAPIError(
            f"Gemma multimodal inference timed out after {effective_timeout}s.",
            error_code="AI_TIMEOUT",
        ) from exc


    except (errors.APIError, errors.ClientError, errors.ServerError, errors.UnknownApiResponseError) as err:
        logger.error(f"GenAI error when invoking model '{resolved_model}': {err}")
        _handle_api_error(err, resolved_model)

    except (GemmaConfigurationError, GemmaAPIError, ValueError):
        raise

    except Exception as exc:
        logger.error(f"Unexpected error during Gemma inference with '{resolved_model}': {exc}", exc_info=True)
        raise GemmaServiceError(f"Gemma inference failed: {str(exc)}") from exc


async def analyze_follow_up_with_gemma(
    image_bytes: bytes,
    mime_type: str,
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
    language: Optional[str] = "en",
    model_name: Optional[str] = None,
    client: Optional[genai.Client] = None,
    timeout: Optional[float] = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    """
    Asynchronously analyze a follow-up question by reusing the cached in-memory image
    and minimal conversation context.
    """
    return await analyze_image_with_gemma(
        image_bytes=image_bytes,
        mime_type=mime_type,
        question=question,
        history=history,
        language=language,
        model_name=model_name,
        client=client,
        timeout=timeout,
    )


def analyze_image_with_gemma_sync(
    image_bytes: bytes,
    mime_type: str,
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
    language: Optional[str] = "en",
    model_name: Optional[str] = None,
    client: Optional[genai.Client] = None,
    timeout: Optional[float] = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    """
    Synchronous version of analyze_image_with_gemma for scripts, testing, and offline jobs.
    """
    resolved_model = (model_name or get_gemma_model_name()).strip()
    effective_timeout = timeout or DEFAULT_TIMEOUT_SECONDS
    contents, config = _prepare_generation_payload(
        image_bytes,
        mime_type,
        question,
        history=history,
        language=language,
        timeout=effective_timeout,
    )
    active_client = client or create_genai_client()

    logger.info(f"Sending synchronous multimodal analysis request to Gemma model '{resolved_model}'...")

    try:
        response = active_client.models.generate_content(
            model=resolved_model,
            contents=contents,
            config=config,
        )
        return _extract_response_text(response, resolved_model)

    except errors.APIError as err:
        logger.error(f"GenAI API error when invoking model '{resolved_model}': {err}")
        _handle_api_error(err, resolved_model)

    except (GemmaConfigurationError, GemmaAPIError, ValueError):
        raise

    except Exception as exc:
        logger.error(f"Unexpected error during synchronous Gemma inference: {exc}", exc_info=True)
        raise GemmaServiceError(f"Gemma inference failed: {str(exc)}") from exc


