"""Security middleware and settings for the ApexFi API.

What this module does (all of it is implemented and covered by tests/test_security.py):
  * CORS origins come from the ALLOWED_ORIGINS env var (no wildcard)
  * security response headers on every response
  * request body size cap (413)
  * per-IP, per-route-group rate limiting (429 + Retry-After), in-memory
  * request IDs + a generic 500 handler that never leaks internals

What it does NOT do (honestly "Planned"): user authentication / roles,
a shared rate-limit store for multi-worker deployments (use Redis), TLS
(terminate it at NGINX / the hosting platform), or any formal compliance.
"""
import os
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

DEFAULT_ORIGINS = "http://localhost:5173,http://localhost:3000"
MAX_BODY_BYTES = 1_000_000  # 1 MB -- every real request here is a few KB at most


def app_env() -> str:
    return os.getenv("APP_ENV", "development").lower()


def is_production() -> bool:
    return app_env() == "production"


def allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS)
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    return [o for o in origins if o != "*"]  # a wildcard is never accepted


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    DOC_PATHS = ("/docs", "/redoc", "/openapi.json")

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), geolocation=(), payment=()"
        if not request.url.path.startswith(self.DOC_PATHS):
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return JSONResponse({"detail": "Request body too large."}, status_code=413)
        return await call_next(request)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = uuid.uuid4().hex[:12]
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response


# (path prefix, max requests, window seconds) -- first match wins, most specific first.
RATE_RULES = [
    ("/api/ask", 10, 60),
    ("/api/report", 10, 60),
    ("/api/compare", 30, 60),
    ("/api/predict", 30, 60),
    ("/api/temporal-validation/score", 30, 60),
    ("/api/dgraph-fin/score", 60, 60),
    ("/api/ethereum-fraud/score", 60, 60),
    ("/api", 600, 60),  # generous default: a page load fires ~10 GETs
]


def _client_ip(request: Request) -> str:
    if os.getenv("TRUST_PROXY", "").lower() in ("1", "true", "yes"):
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limiter, in memory (single process)."""

    def __init__(self, app, rules=None, clock=time.monotonic):
        super().__init__(app)
        self.rules = rules or RATE_RULES
        self.clock = clock
        self.hits = defaultdict(deque)

    def _rule_for(self, path):
        for prefix, limit, window in self.rules:
            if path.startswith(prefix):
                return prefix, limit, window
        return None

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        rule = self._rule_for(request.url.path)
        if rule is None:
            return await call_next(request)
        prefix, limit, window = rule
        key = (_client_ip(request), prefix)
        now = self.clock()
        q = self.hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            retry = max(1, int(window - (now - q[0])))
            return JSONResponse(
                {"detail": "Too many requests. Please wait a moment and try again."},
                status_code=429,
                headers={"Retry-After": str(retry)},
            )
        q.append(now)
        if len(self.hits) > 5000:  # bound memory: drop idle keys
            for k in [k for k, v in self.hits.items() if not v or now - v[-1] > 300]:
                self.hits.pop(k, None)
        return await call_next(request)


async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", "n/a")
    print(f"[error] request_id={rid} {request.method} {request.url.path} -> {type(exc).__name__}: {exc}")
    return JSONResponse(
        {"detail": "Something went wrong on the server.", "requestId": rid}, status_code=500
    )


def install_security(app):
    """Wire everything onto a FastAPI app. Order matters: the LAST middleware
    added is the OUTERMOST, so CORS (added by the caller after this) sees
    rate-limited / oversized responses too and browsers can read them."""
    from fastapi.middleware.cors import CORSMiddleware

    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestSizeLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition", "X-Request-ID", "Retry-After"],
        allow_credentials=False,
    )
