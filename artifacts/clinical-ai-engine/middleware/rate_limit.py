"""
In-process rate limiting.

Deliberately dependency-free and per-process. It is enough to blunt credential
stuffing against /auth/login and to cap the cost of the GPT-4o passthrough on
/query/. A multi-instance deployment needs a shared store (Redis) instead —
see README.
"""
import time
import threading
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# (max requests, window seconds) per client, by path prefix. First match wins.
LIMITS = [
    ("/auth/login", (10, 300)),
    ("/auth/register", (5, 3600)),
    ("/documents/upload", (20, 3600)),
    ("/query", (60, 60)),
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    @staticmethod
    def _client_key(request: Request) -> str:
        # X-Forwarded-For is set by our own gateway; fall back to the socket.
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        limit = next(
            (
                cfg
                for prefix, cfg in LIMITS
                if request.url.path.startswith(prefix)
            ),
            None,
        )
        if limit is None:
            return await call_next(request)

        max_requests, window = limit
        key = f"{self._client_key(request)}:{request.url.path}"
        now = time.monotonic()

        with self._lock:
            bucket = self._hits[key]
            while bucket and now - bucket[0] > window:
                bucket.popleft()
            if len(bucket) >= max_requests:
                retry_after = int(window - (now - bucket[0])) + 1
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests"},
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)

        return await call_next(request)
