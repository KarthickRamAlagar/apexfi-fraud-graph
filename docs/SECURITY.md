# ApexFi security notes

## Implemented (covered by `tests/test_security.py`)
- CORS: origins come from `ALLOWED_ORIGINS`; a wildcard is never accepted; only GET/POST/OPTIONS.
- Security headers on every response: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` (API responses).
- Request body cap: 1 MB (HTTP 413).
- Rate limiting per client IP and route group (HTTP 429 + `Retry-After`); the Ask and PDF routes are the strictest (10/min).
- Request ID on every response; unhandled errors return a generic 500 with only that ID (details go to the server log).
- Input validation: Pydantic models and length/range caps on Ask, temporal scoring, search and `limit` parameters.
- Ask-your-data: generated SQL must be a single SELECT, forbidden keywords blocked, runs on a read-only DB role with a statement timeout and row cap. Provider and database errors are no longer shown to users.
- All SQL in the routers is parameterised.
- `APP_ENV=production` hides `/docs`, `/redoc`, `/openapi.json` and refuses the default read-only DB password.

## Planned (NOT implemented)
- User login and role-based access.
- Shared rate-limit store (Redis) for multi-worker deployments; the current limiter is per process.
- TLS (terminate at NGINX or the hosting platform), secrets manager, audit log.
- No formal compliance (PCI-DSS, RBI, etc.) is claimed.
