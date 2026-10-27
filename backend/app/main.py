"""
FastAPI Gemma 4 Accessibility Assistant Application.

Configures environment-driven CORS, centralized speech-friendly error handling,
security protections against data/key leaks, and modular routers.
"""

import logging
import os
from typing import List
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load environment variables from .env file (always override on reload)
load_dotenv(override=True)

from app.routes.analyze import router as analyze_router
from app.routes.follow_up import router as follow_up_router
from app.utils.errors import AppException, server_error

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("gemma-backend")


def get_configured_cors_origins() -> List[str]:
    """
    Parse allowed CORS origins from environment variables.
    Supports localhost React development and deployed frontend URLs.
    """
    default_dev_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
    ]
    origins_set = set(default_dev_origins)

    # Comma-separated list from CORS_ORIGINS
    env_origins = os.getenv("CORS_ORIGINS", "")
    if env_origins:
        for origin in env_origins.split(","):
            clean = origin.strip()
            if clean:
                origins_set.add(clean)

    # Single deployed frontend URL from FRONTEND_ORIGIN or FRONTEND_URL
    deployed_url = (os.getenv("FRONTEND_ORIGIN") or os.getenv("FRONTEND_URL") or "").strip()
    if deployed_url:
        origins_set.add(deployed_url)

    parsed = list(origins_set)
    logger.info(f"Configured CORS allowed origins: {parsed}")
    return parsed


app = FastAPI(
    title="Gemma 4 Accessibility Assistant API",
    description="Backend for the Gemma 4 Accessibility Assistant hackathon project.",
    version="1.0.0",
)

# Apply CORS middleware using environment configuration + local development regex
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_configured_cors_origins(),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Centralized Error Handlers (Consistent Structure & Speech-Friendly Messages)
# ---------------------------------------------------------------------------
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handle structured, voice-friendly application exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict(),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle FastAPI / Pydantic validation errors with a clean, speech-friendly response.
    Never exposes internal validation schemas to clients.
    """
    logger.warning(f"Request validation error on {request.method} {request.url.path}: {exc}")
    errors = exc.errors()
    field = errors[0].get("loc", ["request"])[-1] if errors else "input"
    message = f"Please check the {field} field and try again."

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "success": False,
            "error": "INVALID_REQUEST",
            "message": message,
            "detail": message,
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Catch standard HTTP exceptions and format into the consistent error structure.
    """
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        content = {
            "success": False,
            "error": exc.detail.get("error", "HTTP_ERROR"),
            "message": exc.detail.get("message", "An error occurred."),
            "detail": exc.detail.get("detail", exc.detail.get("message", "An error occurred.")),
        }
    else:
        # Map common status codes to standard error codes and speech-friendly messages
        detail_msg = str(exc.detail) if exc.detail else "An error occurred."
        error_code_map = {
            400: ("BAD_REQUEST", detail_msg),
            401: ("UNAUTHORIZED", "Authentication failed. Please verify credentials."),
            403: ("FORBIDDEN", "You do not have permission to perform this action."),
            404: ("NOT_FOUND", detail_msg),
            413: ("IMAGE_TOO_LARGE", "The image is too large. Please use a photo under 10 megabytes."),
            429: ("RATE_LIMIT_EXCEEDED", "The visual assistant is currently busy. Please wait a moment."),
            502: ("AI_ERROR", detail_msg),
            503: ("SERVICE_UNAVAILABLE", detail_msg),
            504: ("AI_TIMEOUT", "The visual assistant took too long to respond. Please try again."),
        }
        code, msg = error_code_map.get(exc.status_code, ("ERROR", detail_msg))
        content = {
            "success": False,
            "error": code,
            "message": msg,
            "detail": detail_msg,
        }

    return JSONResponse(
        status_code=exc.status_code,
        content=content,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for unhandled exceptions.
    Logs the full traceback server-side while guaranteeing NO credentials,
    stack traces, or internal paths leak to the client.
    """
    import traceback
    error_str = f"Unhandled server error on {request.method} {request.url.path}: {exc}\n{traceback.format_exc()}"
    logger.error(error_str)
    try:
        with open("error_debug.log", "a", encoding="utf-8") as f:
            f.write(error_str + "\n")
    except Exception:
        pass
    from app.utils.errors import _sanitize_text
    sanitized = _sanitize_text(str(exc))
    fallback = server_error(f"Server error: {sanitized}" if sanitized else "An unexpected server error occurred.")
    return JSONResponse(
        status_code=fallback.status_code,
        content=fallback.to_dict(),
    )


# ---------------------------------------------------------------------------
# Health Check Endpoint
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["Health"])
async def health_check():
    """Health check endpoint to verify backend status."""
    return {
        "status": "ok"
    }


# Include modular routers
app.include_router(analyze_router)
app.include_router(follow_up_router)
