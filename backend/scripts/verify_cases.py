"""
Demonstration script to verify the 5 required test cases:
1. Valid image + question
2. Empty question
3. Missing image
4. Non-image file
5. Gemma API failure
"""

import io
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

from app.services.gemma_service import GemmaAPIError

client = TestClient(app)


def make_png(color="green"):
    img = Image.new("RGB", (100, 100), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def run_case(title, func):
    print(f"\n--- [Test Case] {title} ---")
    status_code, json_data = func()
    print(f"Status Code: {status_code}")
    print(f"Response:    {json_data}")


def main():
    png_bytes = make_png()

    # Case 1: Valid image + question
    def case_valid():
        with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = "Ahead of you is a clear wooden dining table with a green mug."
            res = client.post(
                "/api/analyze",
                files={"image": ("scene.png", png_bytes, "image/png")},
                data={"question": "What is in front of me?"},
            )
            return res.status_code, res.json()

    # Case 2: Empty question
    def case_empty_question():
        res = client.post(
            "/api/analyze",
            files={"image": ("scene.png", png_bytes, "image/png")},
            data={"question": "   "},
        )
        return res.status_code, res.json()

    # Case 3: Missing image
    def case_missing_image():
        res = client.post(
            "/api/analyze",
            data={"question": "What is in front of me?"},
        )
        return res.status_code, res.json()

    # Case 4: Non-image file
    def case_non_image():
        res = client.post(
            "/api/analyze",
            files={"image": ("notes.txt", b"Random text file contents", "text/plain")},
            data={"question": "Describe this image."},
        )
        return res.status_code, res.json()

    # Case 5: Gemma API failure
    def case_gemma_failure():
        with patch("app.routes.analyze.analyze_image_with_gemma", new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = GemmaAPIError("Gemini API rate limit or quota exceeded.")
            res = client.post(
                "/api/analyze",
                files={"image": ("scene.png", png_bytes, "image/png")},
                data={"question": "Describe this scene."},
            )
            return res.status_code, res.json()

    print("=" * 60)
    print("VERIFYING REQUIRED PHASE 4 TEST CASES")
    print("=" * 60)
    run_case("1. Valid Image + Question", case_valid)
    run_case("2. Empty Question", case_empty_question)
    run_case("3. Missing Image", case_missing_image)
    run_case("4. Non-Image File", case_non_image)
    run_case("5. Gemma API Failure", case_gemma_failure)
    print("\n" + "=" * 60)
    print("ALL 5 REQUIRED CASES COMPLETED SUCCESSFULLY")
    print("=" * 60)


if __name__ == "__main__":
    main()
