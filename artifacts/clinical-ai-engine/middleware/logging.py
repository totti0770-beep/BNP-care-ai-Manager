"""
Structured request logging.

Emits one JSON line per request so logs can be shipped and queried, with a
request id that correlates the access line to anything logged while handling it.

Deliberately logs no request body and no query string: a clinical question may
contain patient identifiers, and belongs only in the access-controlled audit
table.
"""
import json
import logging
import time
import uuid
from contextvars import ContextVar

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

logger = logging.getLogger("access")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": request_id_var.get(),
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        # Anything passed via `extra=` on the log call.
        for key, value in getattr(record, "__dict__", {}).items():
            if key.startswith("bnp_"):
                payload[key[4:]] = value
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(as_json: bool) -> None:
    handler = logging.StreamHandler()
    if as_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s — %(message)s")
        )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id_var.set(request_id)
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "request failed",
                extra={
                    "bnp_method": request.method,
                    "bnp_path": request.url.path,
                    "bnp_duration_ms": round((time.perf_counter() - started) * 1000),
                },
            )
            request_id_var.reset(token)
            raise

        logger.info(
            "request",
            extra={
                "bnp_method": request.method,
                # Path only — never the query string.
                "bnp_path": request.url.path,
                "bnp_status": response.status_code,
                "bnp_duration_ms": round((time.perf_counter() - started) * 1000),
            },
        )
        response.headers["x-request-id"] = request_id
        request_id_var.reset(token)
        return response
