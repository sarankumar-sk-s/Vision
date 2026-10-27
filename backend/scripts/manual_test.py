"""
Quick manual verification script for Gemma 4 multimodal service.
Usage:
    python scripts/manual_test.py [path_to_image] [question]
"""

import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.gemma_service import (
    GemmaAPIError,
    GemmaConfigurationError,
    analyze_image_with_gemma_sync,
)


def main():
    image_path = sys.argv[1] if len(sys.argv) > 1 else str(backend_dir / "test_image.png")
    question = sys.argv[2] if len(sys.argv) > 2 else "Describe what you see in this image."

    print("=" * 60)
    print("Gemma 4 Multimodal Manual Test")
    print("=" * 60)
    print(f"Target Image: {image_path}")
    print(f"Question:     {question}")
    print(f"GEMMA_MODEL:  {os.getenv('GEMMA_MODEL') or '<NOT SET>'}")
    print(f"API Key:      {'Configured (Hidden)' if os.getenv('GEMINI_API_KEY') else '<NOT SET>'}")
    print("=" * 60)

    if not Path(image_path).exists():
        print(f"Error: Image file does not exist at {image_path}")
        sys.exit(1)

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    # Determine MIME type
    mime_type = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"

    try:
        print("\nInvoking Gemma 4 multimodal service...")
        answer = analyze_image_with_gemma_sync(
            image_bytes=image_bytes,
            mime_type=mime_type,
            question=question,
        )
        print("\n--- Assistant Answer ---")
        print(answer)
        print("------------------------\n")
    except GemmaConfigurationError as exc:
        print(f"\n[CONFIGURATION ERROR]: {exc}")
    except GemmaAPIError as exc:
        print(f"\n[API ERROR]: {exc}")
    except Exception as exc:
        print(f"\n[UNEXPECTED ERROR]: {exc}")


if __name__ == "__main__":
    main()
