"""
In-memory image processing and validation service for Gemma 4 multimodal pipeline.

Validates JPEG, PNG, and WEBP formats, verifies binary image integrity,
and applies lightweight in-memory resizing/compression without saving to disk.
"""

import io
import logging
from typing import Set, Tuple
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger("gemma-backend")

# Allowed MIME types strictly required
ALLOWED_MIME_TYPES: Set[str] = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

MIME_TO_PIL_FORMAT = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}

PIL_FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}

# Image processing thresholds
MAX_IMAGE_DIMENSION: int = 1568  # Optimal maximum width/height for vision models
MAX_IN_MEMORY_SIZE_BYTES: int = 2 * 1024 * 1024  # 2 MB threshold to trigger compression
MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB maximum upload limit


class ImageValidationError(Exception):
    """Raised when an uploaded file fails image validation checks."""
    def __init__(self, message: str, error_code: str = "INVALID_IMAGE"):
        super().__init__(message)
        self.message = message
        self.error_code = error_code


def validate_and_process_image(
    raw_bytes: bytes,
    content_type: str,
    max_dimension: int = MAX_IMAGE_DIMENSION,
    max_size_bytes: int = MAX_IN_MEMORY_SIZE_BYTES,
) -> Tuple[bytes, str]:
    """
    Validate and process image entirely in memory.

    1. Validates MIME type matches JPEG, PNG, or WEBP.
    2. Decodes image header to verify it is a valid, readable image.
    3. Preserves the original MIME type.
    4. Lightweight resizing/compression if dimensions or size exceed thresholds.
    5. Leaves files completely in memory; never writes to permanent disk.

    Args:
        raw_bytes: Binary image bytes read from the request.
        content_type: Declared Content-Type header.
        max_dimension: Maximum allowed width/height before downsampling.
        max_size_bytes: Size threshold above which re-compression is triggered.

    Returns:
        Tuple of (processed_bytes, preserved_mime_type).

    Raises:
        ImageValidationError: With speech-friendly message and standard error_code.
    """
    clean_content_type = (content_type or "").strip().lower()

    # 1. Validate declared MIME type
    if clean_content_type not in ALLOWED_MIME_TYPES:
        raise ImageValidationError(
            message=f"Unsupported image format '{clean_content_type or 'unknown'}'. Please use a JPEG, PNG, or WebP photo.",
            error_code="UNSUPPORTED_IMAGE_FORMAT",
        )

    # 2. Check byte length
    if not raw_bytes or len(raw_bytes) == 0:
        raise ImageValidationError(
            message="Please capture an image and try again.",
            error_code="IMAGE_REQUIRED",
        )

    if len(raw_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise ImageValidationError(
            message="The image is too large. Please use a photo under 10 megabytes.",
            error_code="IMAGE_TOO_LARGE",
        )

    # 3. Verify image integrity and true format via Pillow
    try:
        image_stream = io.BytesIO(raw_bytes)
        with Image.open(image_stream) as img:
            detected_format = (img.format or "").upper()
            if detected_format not in PIL_FORMAT_TO_MIME:
                raise ImageValidationError(
                    message=f"Unsupported image format '{detected_format}'. Please use a JPEG, PNG, or WebP photo.",
                    error_code="UNSUPPORTED_IMAGE_FORMAT",
                )

            # Ensure format matches declared MIME family
            expected_format = MIME_TO_PIL_FORMAT.get(clean_content_type)
            if detected_format != expected_format and not (
                detected_format == "JPEG" and expected_format == "JPEG"
            ):
                logger.warning(
                    f"Image format mismatch: declared {clean_content_type} but detected {detected_format}. Using detected format."
                )
                clean_content_type = PIL_FORMAT_TO_MIME[detected_format]

            width, height = img.size
            needs_resize = width > max_dimension or height > max_dimension
            needs_compression = len(raw_bytes) > max_size_bytes

            # If within bounds, return original bytes directly without re-encoding
            if not needs_resize and not needs_compression:
                return raw_bytes, clean_content_type

            # 4. Perform lightweight in-memory resize/compress
            logger.info(
                f"Processing image in memory: original {width}x{height} ({len(raw_bytes) / 1024:.1f} KB), "
                f"target max dimension {max_dimension}"
            )

            # Clone image to avoid altering original stream
            processed_img = img.copy()

            if needs_resize:
                scale = min(max_dimension / width, max_dimension / height)
                new_width = max(1, int(width * scale))
                new_height = max(1, int(height * scale))
                processed_img = processed_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                logger.debug(f"Resized image to {new_width}x{new_height}")

            output_format = detected_format

            # Convert color mode if necessary (e.g., RGBA to RGB for JPEG)
            if output_format == "JPEG" and processed_img.mode in ("RGBA", "P", "LA"):
                background = Image.new("RGB", processed_img.size, (255, 255, 255))
                if processed_img.mode == "P":
                    processed_img = processed_img.convert("RGBA")
                if "A" in processed_img.mode:
                    background.paste(processed_img, mask=processed_img.split()[-1])
                else:
                    background.paste(processed_img)
                processed_img = background
            elif output_format == "WEBP" and processed_img.mode not in ("RGB", "RGBA"):
                processed_img = processed_img.convert("RGBA")

            # Encode to in-memory BytesIO
            output_buffer = io.BytesIO()
            save_kwargs = {"format": output_format}

            if output_format == "JPEG":
                save_kwargs["quality"] = 85
                save_kwargs["optimize"] = True
            elif output_format == "WEBP":
                save_kwargs["quality"] = 85
                save_kwargs["method"] = 4
            elif output_format == "PNG":
                save_kwargs["optimize"] = True

            processed_img.save(output_buffer, **save_kwargs)
            processed_bytes = output_buffer.getvalue()

            logger.info(
                f"Image processing completed in memory: "
                f"{len(raw_bytes) / 1024:.1f} KB -> {len(processed_bytes) / 1024:.1f} KB"
            )
            return processed_bytes, clean_content_type

    except UnidentifiedImageError as exc:
        logger.warning(f"Failed to identify uploaded image: {exc}")
        raise ImageValidationError(
            message="We could not read that image. Please capture a clearer photo and try again.",
            error_code="CORRUPTED_IMAGE",
        ) from exc
    except ImageValidationError:
        raise
    except Exception as exc:
        logger.error(f"Unexpected error while processing image: {exc}", exc_info=True)
        raise ImageValidationError(
            message="We could not read that image. Please capture a clearer photo and try again.",
            error_code="CORRUPTED_IMAGE",
        ) from exc
