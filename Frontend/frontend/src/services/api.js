/**
 * VisionMate API Service
 * Encapsulates all network communication with the FastAPI backend.
 *
 * Backend contract (POST /api/analyze):
 *   multipart/form-data: "image" (JPEG blob) + "question" (string)
 *   Response: { "success": true, "answer": string, "session_id": string }
 *
 * Backend contract (POST /api/follow-up):
 *   JSON: { "session_id": string, "question": string }
 *   Response: { "success": true, "answer": string }
 *
 * SECURITY: GEMINI_API_KEY is NEVER exposed here. Only the backend URL is used.
 */

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'https://vision-ke6v.onrender.com'
).replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 90000; // 90s — accommodates Render cold start + Gemma multimodal inference

/**
 * Sends image and question to the backend POST /api/analyze endpoint.
 *
 * @param {Blob} imageBlob - JPEG image blob captured from camera
 * @param {string} question - User question
 * @param {string} [language='en'] - 'en' or 'ta'
 * @returns {Promise<{ answer: string, session_id: string }>}
 */
export async function analyzeImage(imageBlob, question, language = 'en') {
  if (!question || !question.trim()) {
    throw new Error('A question must be provided for visual analysis.');
  }
  if (!imageBlob) {
    throw new Error('An image must be captured before analysis.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Auto-detect language if question contains Tamil characters as safety fallback
  const isTamil = /[\u0B80-\u0BFF]/.test(question);
  const resolvedLang = isTamil ? 'ta' : (language || 'en');

  // Let the browser set the multipart boundary automatically — do NOT set Content-Type manually.
  const formData = new FormData();
  formData.append('image', imageBlob, 'capture.jpg');
  formData.append('question', question.trim());
  formData.append('language', resolvedLang);

  try {
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg =
        typeof data.message === 'string'
          ? data.message
          : typeof data.detail === 'string'
          ? data.detail
          : `Server error ${response.status}.`;
      const err = new Error(msg);
      err.code = data.error || (data.detail && typeof data.detail === 'object' ? data.detail.error : null);
      throw err;
    }

    if (!data.success || typeof data.answer !== 'string') {
      throw new Error(data.message || 'Unexpected response from server.');
    }

    return {
      answer: data.answer,
      session_id: data.session_id || null,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new Error('Request timed out. The assistant took longer than expected to respond. Please try again.');
    }
    if (err.name === 'TypeError' && (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('failed'))) {
      throw new Error(
        'Unable to reach the assistant server. The service may be waking up or temporarily unavailable. Please try again in a moment.',
      );
    }
    throw err;
  }
}

/**
 * Sends a follow-up question to the backend POST /api/follow-up endpoint.
 * Reuses the same session image — NO new image is captured.
 *
 * @param {string} sessionId - Session ID returned by analyzeImage
 * @param {string} question - Follow-up question
 * @param {string} [language='en'] - 'en' or 'ta'
 * @returns {Promise<{ answer: string }>}
 */
export async function askFollowUp(sessionId, question, language = 'en') {
  if (!sessionId) {
    throw new Error('No active session. Please start a new scan first.');
  }
  if (!question || !question.trim()) {
    throw new Error('A question must be provided.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Auto-detect language if question contains Tamil characters as safety fallback
  const isTamil = /[\u0B80-\u0BFF]/.test(question);
  const resolvedLang = isTamil ? 'ta' : (language || 'en');

  try {
    const response = await fetch(`${API_BASE_URL}/api/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        question: question.trim(),
        language: resolvedLang,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errCode =
        data.error ||
        (data.detail && typeof data.detail === 'object' ? data.detail.error : null);
      const msg =
        typeof data.message === 'string'
          ? data.message
          : typeof data.detail === 'string'
          ? data.detail
          : `Server error ${response.status}.`;
      const sessionErr = new Error(msg);
      sessionErr.code = errCode;
      throw sessionErr;
    }

    if (!data.success || typeof data.answer !== 'string') {
      throw new Error(data.message || 'Unexpected follow-up response from server.');
    }

    return { answer: data.answer };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new Error('Follow-up request timed out. The assistant took longer than expected to respond. Please try again.');
    }
    if (err.name === 'TypeError' && (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('failed'))) {
      throw new Error(
        'Unable to reach the assistant server. The service may be waking up or temporarily unavailable. Please try again in a moment.',
      );
    }
    throw err;
  }
}

/**
 * Checks if the backend is reachable.
 * @returns {Promise<boolean>}
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, { method: 'GET' });
    const data = await response.json().catch(() => ({}));
    return response.ok && data.status === 'ok';
  } catch {
    return false;
  }
}

export { API_BASE_URL };
