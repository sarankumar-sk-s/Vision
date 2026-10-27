"""
Accessibility system instructions for Gemma multimodal assistant with English & Tamil bilingual support.
"""

import re
from typing import Optional

# Tamil Unicode range: \u0B80 to \u0BFF
TAMIL_UNICODE_PATTERN = re.compile(r"[\u0B80-\u0BFF]")


def detect_text_language(text: str, fallback_lang: str = "en") -> str:
    """
    Detect if text contains Tamil Unicode characters.
    If Tamil characters are present, returns 'ta'.
    Otherwise, returns sanitized fallback_lang ('ta' or 'en').
    """
    if text and TAMIL_UNICODE_PATTERN.search(text):
        return "ta"
    clean = (fallback_lang or "en").lower().strip()
    return "ta" if clean.startswith("ta") else "en"


ACCESSIBILITY_SYSTEM_INSTRUCTION = (
    "You are an accessibility assistant helping users understand visual information around them.\n\n"
    "Answer the user's specific question using only information reasonably supported by the provided image.\n\n"
    "Keep responses concise, clear and easy to understand when spoken aloud.\n\n"
    "If important visual information is unclear, say that you are unsure rather than inventing details.\n\n"
    "You are an environment and document understanding assistant, not a replacement for a cane, guide dog, mobility aid or safety-critical navigation system."
)


def get_accessibility_system_instruction(language: Optional[str] = None) -> str:
    """
    Return the system instruction string for the accessibility assistant.
    If language is 'ta' (Tamil), appends strong Tamil language instructions.
    """
    clean_lang = (language or "").lower().strip()
    if clean_lang.startswith("ta"):
        return (
            f"{ACCESSIBILITY_SYSTEM_INSTRUCTION}\n\n"
            "LANGUAGE INSTRUCTION (TAMIL):\n"
            "The user is speaking Tamil.\n"
            "Respond entirely in natural Tamil script (தமிழ்).\n"
            "Do not answer in English unless a proper noun, brand name, technical term, or unavoidable term requires it.\n"
            "The answer will be spoken aloud to an accessibility user.\n"
            "Use simple, conversational, polite Tamil.\n"
            "Keep the answer concise and clear."
        )
    return ACCESSIBILITY_SYSTEM_INSTRUCTION
