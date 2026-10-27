"""
In-memory session store for temporary image caching and follow-up interaction.
No database or Redis is used for this hackathon MVP.
Sessions are stored strictly in RAM with automatic TTL expiration, LRU eviction,
and explicit tracking of expired vs invalid session states.
"""

from collections import deque
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("gemma-backend")

DEFAULT_SESSION_TTL_SECONDS: int = int(os.getenv("SESSION_TTL_SECONDS", str(30 * 60)))  # 30 minutes default
MAX_IN_MEMORY_SESSIONS: int = int(os.getenv("MAX_IN_MEMORY_SESSIONS", "200"))  # Cap active sessions
MAX_HISTORY_TURNS: int = 10  # Maximum turns (5 Q&A pairs) to retain in memory
MAX_EXPIRED_TRACKING: int = 500  # Cap expired IDs tracked to prevent memory growth


class InMemorySessionStore:
    """
    Thread-safe in-memory store for temporarily caching uploaded images
    and minimal conversation context for follow-up accessibility questions.
    """

    def __init__(
        self,
        ttl_seconds: int = DEFAULT_SESSION_TTL_SECONDS,
        max_sessions: int = MAX_IN_MEMORY_SESSIONS,
        max_history_turns: int = MAX_HISTORY_TURNS,
    ):
        self.ttl_seconds = ttl_seconds
        self.max_sessions = max_sessions
        self.max_history_turns = max_history_turns
        self._lock = threading.Lock()
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._expired_session_ids: set = set()
        self._expired_queue: deque = deque(maxlen=MAX_EXPIRED_TRACKING)

    def _purge_expired_locked(self) -> int:
        """
        Purge sessions that have exceeded TTL or exceed max_sessions capacity.
        Must be called while holding _lock.
        """
        now = time.time()
        expired_keys = [
            sid for sid, data in self._sessions.items()
            if now - data.get("last_accessed", 0) > self.ttl_seconds
        ]
        for sid in expired_keys:
            del self._sessions[sid]
            # Track as expired so we can distinguish expired vs completely invalid IDs
            if sid not in self._expired_session_ids:
                if len(self._expired_queue) >= MAX_EXPIRED_TRACKING:
                    oldest = self._expired_queue.popleft()
                    self._expired_session_ids.discard(oldest)
                self._expired_session_ids.add(sid)
                self._expired_queue.append(sid)

        if expired_keys:
            logger.debug(f"Purged {len(expired_keys)} expired in-memory sessions.")

        # If still over capacity, perform LRU eviction on oldest accessed sessions
        if len(self._sessions) > self.max_sessions:
            sorted_by_lru = sorted(
                self._sessions.items(),
                key=lambda item: item[1].get("last_accessed", 0)
            )
            excess_count = len(self._sessions) - self.max_sessions
            for i in range(excess_count):
                evicted_sid = sorted_by_lru[i][0]
                del self._sessions[evicted_sid]
                if evicted_sid not in self._expired_session_ids:
                    if len(self._expired_queue) >= MAX_EXPIRED_TRACKING:
                        oldest = self._expired_queue.popleft()
                        self._expired_session_ids.discard(oldest)
                    self._expired_session_ids.add(evicted_sid)
                    self._expired_queue.append(evicted_sid)
            logger.info(f"Evicted {excess_count} LRU sessions to prevent unbounded memory growth.")

        return len(expired_keys)

    def save_session(
        self,
        session_id: str,
        image_bytes: bytes,
        mime_type: str,
        question: str,
        answer: str,
        language: str = "en",
    ) -> None:
        """Save a new session with its initial image and Q&A pair."""
        now = time.time()
        with self._lock:
            self._purge_expired_locked()
            self._sessions[session_id] = {
                "session_id": session_id,
                "image_bytes": image_bytes,
                "mime_type": mime_type,
                "language": language,
                "created_at": now,
                "last_accessed": now,
                "history": [
                    {"role": "user", "text": question},
                    {"role": "assistant", "text": answer},
                ],
            }
            logger.debug(f"Saved session {session_id} in memory (active count: {len(self._sessions)})")

    def get_session_status(self, session_id: str) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Check session status and return (status, session_dict).
        Status is one of:
        - 'ACTIVE': session is valid and active, returns session data
        - 'EXPIRED': session existed but timed out past TTL / LRU
        - 'INVALID': session never existed or is an unrecognized ID
        """
        now = time.time()
        with self._lock:
            self._purge_expired_locked()
            session = self._sessions.get(session_id)
            if session:
                session["last_accessed"] = now
                return "ACTIVE", {
                    "session_id": session["session_id"],
                    "image_bytes": session["image_bytes"],
                    "mime_type": session["mime_type"],
                    "created_at": session["created_at"],
                    "last_accessed": session["last_accessed"],
                    "history": list(session["history"]),
                }

            if session_id in self._expired_session_ids:
                return "EXPIRED", None

            return "INVALID", None

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve active session or None."""
        status, data = self.get_session_status(session_id)
        return data if status == "ACTIVE" else None

    def add_interaction(self, session_id: str, question: str, answer: str) -> bool:
        """
        Append a follow-up Q&A pair to an existing session while bounding history length.
        """
        now = time.time()
        with self._lock:
            self._purge_expired_locked()
            session = self._sessions.get(session_id)
            if not session:
                return False

            session["last_accessed"] = now
            session["history"].append({"role": "user", "text": question})
            session["history"].append({"role": "assistant", "text": answer})

            if len(session["history"]) > self.max_history_turns:
                session["history"] = session["history"][-self.max_history_turns:]

            logger.debug(f"Added follow-up interaction to session {session_id}")
            return True

    def delete_session(self, session_id: str) -> bool:
        """Explicitly delete a session."""
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                return True
            return False

    def purge_expired(self) -> int:
        """Explicitly run expiration cleanup and return count of deleted sessions."""
        with self._lock:
            return self._purge_expired_locked()

    def count(self) -> int:
        """Return the count of currently active sessions in memory."""
        with self._lock:
            self._purge_expired_locked()
            return len(self._sessions)

    def clear(self) -> None:
        """Clear all sessions and history (primarily for test teardowns)."""
        with self._lock:
            self._sessions.clear()
            self._expired_session_ids.clear()
            self._expired_queue.clear()


# Global singleton store instance
session_store = InMemorySessionStore()


def get_session_store() -> InMemorySessionStore:
    """Return the global in-memory session store instance."""
    return session_store
