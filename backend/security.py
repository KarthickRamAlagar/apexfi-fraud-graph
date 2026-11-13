"""Security middleware and settings for the ApexFi API.

What this module does (all of it is implemented and covered by tests/test_security.py):
  * CORS origins come from the ALLOWED_ORIGINS env var (no wildcard)
  * security response headers on every response
  * request body size cap (413)
  * per-IP, per-route-group rate limiting (429 + Retry-After), in-memory
  * request IDs + a generic 500 handler that never leaks internals

Multi-server deployment:
  * RATE_LIMIT_REDIS_URL=redis://host:6379/0 makes the rate limiter shared across
    workers / servers (Redis). Unset = in-memory (fine for one process). If Redis is
    unreachable the limiter falls back to in-memory and logs a warning (fail-open).
  * TLS itself is terminated by the reverse proxy / hosting platform (see docs/DEPLOYMENT.md).
    The app adds HSTS (in production, over HTTPS) and can redirect http -> https
    (FORCE_HTTPS=true, only behind a trusted proxy: TRUST_PROXY=true).

What it does NOT do (honestly "Planned"): user authentication / roles
or any formal compliance.
"""
import os
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse, RedirectResponse
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
        if is_production() and _is_https(request):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
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


class MemoryRateBackend:
    """Sliding-window limiter in this process's memory."""

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.hits = defaultdict(deque)

    async def hit(self, key: str, limit: int, window: int):
        """Returns (allowed, retry_after_seconds)."""
        now = self.clock()
        q = self.hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return False, max(1, int(window - (now - q[0])))
        q.append(now)
        if len(self.hits) > 5000:  # bound memory: drop idle keys
            for k in [k for k, v in self.hits.items() if not v or now - v[-1] > 300]:
                self.hits.pop(k, None)
        return True, 0


# Atomic sliding-window log in Redis: drop old hits, count, then add this one if allowed.
_REDIS_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = math.ceil(window - (now - tonumber(oldest[2])))
  if retry < 1 then retry = 1 end
  return {0, retry}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window * 1000 + 1000)
return {1, 0}
"""


class RedisRateBackend:
    """Sliding-window limiter shared by every worker / server through Redis.
    If Redis errors, it falls back to a local in-memory limiter so the API stays up."""

    def __init__(self, url: str, fallback=None):
        import redis.asyncio as aioredis  # imported lazily: only needed when Redis is configured

        self.client = aioredis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        self.script = self.client.register_script(_REDIS_LUA)
        self.fallback = fallback or MemoryRateBackend()
        self._warned = False

    async def hit(self, key: str, limit: int, window: int):
        try:
            now = time.time()
            member = f"{now}:{uuid.uuid4().hex[:8]}"
            allowed, retry = await self.script(keys=[f"apexfi:rl:{key}"], args=[now, window, limit, member])
            self._warned = False
            return bool(allowed), int(retry)
        except Exception as e:  # network down, auth failure, etc.
            if not self._warned:
                print(f"[security] Redis rate limiter unavailable, using in-memory fallback: {type(e).__name__}: {e}")
                self._warned = True
            return await self.fallback.hit(key, limit, window)


def make_rate_backend(clock=time.monotonic):
    url = os.getenv("RATE_LIMIT_REDIS_URL", "").strip()
    if url:
        try:
            print("[security] rate limiting: shared Redis backend")
            return RedisRateBackend(url, MemoryRateBackend(clock))
        except Exception as e:
            print(f"[security] could not start Redis backend ({type(e).__name__}: {e}); using in-memory")
    return MemoryRateBackend(clock)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per client IP and route group. In-memory by default, shared via Redis when configured."""

    def __init__(self, app, rules=None, clock=time.monotonic, backend=None):
        super().__init__(app)
        self.rules = rules or RATE_RULES
        self.backend = backend or make_rate_backend(clock)

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
        allowed, retry = await self.backend.hit(f"{_client_ip(request)}|{prefix}", limit, window)
        if not allowed:
            return JSONResponse(
                {"detail": "Too many requests. Please wait a moment and try again."},
                status_code=429,
                headers={"Retry-After": str(retry)},
            )
        return await call_next(request)


def _is_https(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    if os.getenv("TRUST_PROXY", "").lower() in ("1", "true", "yes"):
        return request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower() == "https"
    return False


class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    """FORCE_HTTPS=true: send plain-http requests to https. Only valid behind a trusted proxy
    that sets X-Forwarded-Proto (TRUST_PROXY=true); /health stays open for platform probes."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health" or _is_https(request):
            return await call_next(request)
        return RedirectResponse(str(request.url.replace(scheme="https")), status_code=308)


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
    if os.getenv("FORCE_HTTPS", "").lower() in ("1", "true", "yes"):
        app.add_middleware(HTTPSRedirectMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        expose_headers=["Content-Disposition", "X-Request-ID", "Retry-After"],
        allow_credentials=False,
    )
