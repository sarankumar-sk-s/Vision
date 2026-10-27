# VisionMate

**VisionMate** is a voice-first multimodal visual accessibility assistant for visually impaired and low-vision individuals, with full visual and tactile parity for hearing-impaired users.

---

## Quick Start

### 1. Install Dependencies
```bash
# From root or inside frontend/
npm --prefix frontend install
```

### 2. Start the Development Server
```bash
# Starts Vite at http://localhost:5173
npm run dev
# or from inside frontend:
cd frontend && npm run dev
```

### 3. Build for Production
```bash
npm run build
```

---

## Backend Contract

All network requests go through [`src/services/api.js`](frontend/src/services/api.js).

- **Endpoint**: `POST {VITE_API_URL}/api/analyze`
- **Request (multipart/form-data)**:
  - `image`: JPEG blob (max 1280px on long edge, 0.85 quality)
  - `question`: string
- **Response**: `{ "answer": string, "status": "success" }`
- **Timeout**: 20 seconds (`AbortController`)

### Mock Mode
Set `VITE_USE_MOCK=true` in `frontend/.env` to run VisionMate offline with simulated AI responses and a 1.5-second processing delay.

---

## State Machine

The single source of truth is implemented via `useReducer` in [`src/state/machine.js`](frontend/src/state/machine.js):

```
STANDBY -> READY -> LISTENING -> CAPTURE -> PROCESSING -> ANSWER -> WAITING -> NEXT_ACTION -> (LISTENING | CAPTURE)
                                                                                          \
                                                                                  ERROR from anywhere
```

- **STANDBY**: Passive listening for wake word `"Vision"`.
- **READY**: Speaks `"I am ready. Simply speak or press the center button."`
- **LISTENING**: Speaks `"I am listening."` then captures question via SpeechRecognition.
- **CAPTURE**: Speaks `"Capturing image."` then grabs one frame from camera (`getUserMedia` facingMode: `"environment"`). Reuses existing image on follow-up questions.
- **PROCESSING**: Speaks `"Image captured. Please wait while I process it."` and calls `/api/analyze`.
- **ANSWER**: Displays large text (24px+) and speaks the AI answer.
- **WAITING**: Speaks `"Take your time. Say continue when you are ready."` (no timeout).
- **NEXT_ACTION**: Speaks `"Ask a follow-up, or say new scan."`
- **ERROR**: Spoken aloud and displayed with a **Try Again** button.

---

## Voice Commands

- **"Vision"**: Configurable wake word (defined in `WAKE_WORD`).
- **"Continue"**: Advances from WAITING to follow-up/next action.
- **"Repeat"** / **"Repeat answer"**: Replays the last answer aloud.
- **"Stop"** / **"Cancel"**: Halts speech immediately.
- **"New scan"** / **"Scan again"**: Clears the current image and starts a new camera scan.

---

## Accessibility & Design

- Single screen, `100dvh`, no scrolling of main layout.
- Minimum 160px center circular action button with slow pulse ring during listening.
- Minimum 56px secondary buttons (**Repeat Answer**, **New Scan**).
- Status indicator pill with shape dot + text (never color alone).
- High-contrast light theme and system dark theme.
- Atkinson/Inter typography scale with M, L, and XL text sizing.
- WCAG AAA contrast ratio compliance and visible focus rings.
- Mandatory disclaimer in footer: *"Not a replacement for a cane, guide dog, or mobility aid."*
