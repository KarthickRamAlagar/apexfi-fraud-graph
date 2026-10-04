"""Multi-server pieces: Redis-shared rate limit, fallback, HSTS, https redirect.
The Redis tests need a local redis-server; they skip themselves if one is not running
(start one with:  redis-server --port 6391 --save "" )."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import security

REDIS_URL = "redis://127.0.0.1:6391/0"


def _redis_up():
    try:
        import redis

        redis.Redis.from_url(REDIS_URL, socket_connect_timeout=0.5).ping()
        return True
    except Exception:
        return False


needs_redis = pytest.mark.skipif(not _redis_up(), reason="no redis-server on port 6391")


def make_app():
    app = FastAPI()
    security.install_security(app)

    @app.get("/api/x")
    def x():
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


@needs_redis
def test_limit_is_shared_between_two_servers(monkeypatch):
    import redis

    redis.Redis.from_url(REDIS_URL).flushdb()
    monkeypatch.setattr(security, "RATE_RULES", [("/api", 4, 60)])
    monkeypatch.setenv("RATE_LIMIT_REDIS_URL", REDIS_URL)
    # two separate app instances = two servers, no shared memory between them
    with TestClient(make_app()) as server_a, TestClient(make_app()) as server_b:
        codes = [server_a.get("/api/x").status_code, server_b.get("/api/x").status_code,
                 server_a.get("/api/x").status_code, server_b.get("/api/x").status_code]
        assert codes == [200, 200, 200, 200]
        blocked = server_a.get("/api/x")
        assert blocked.status_code == 429 and "retry-after" in blocked.headers
        assert server_b.get("/api/x").status_code == 429  # B sees A's hits


def test_memory_limit_is_per_server(monkeypatch):
    monkeypatch.delenv("RATE_LIMIT_REDIS_URL", raising=False)
    monkeypatch.setattr(security, "RATE_RULES", [("/api", 2, 60)])
    with TestClient(make_app()) as a, TestClient(make_app()) as b:
        assert [a.get("/api/x").status_code for _ in range(3)] == [200, 200, 429]
        assert b.get("/api/x").status_code == 200  # separate memory: the weakness Redis fixes


def test_redis_down_falls_back_to_memory(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_REDIS_URL", "redis://127.0.0.1:1/0")  # nothing listens here
    monkeypatch.setattr(security, "RATE_RULES", [("/api", 2, 60)])
    with TestClient(make_app()) as c:
        assert [c.get("/api/x").status_code for _ in range(3)] == [200, 200, 429]


def test_hsts_only_in_production_over_https(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    c = TestClient(make_app(), base_url="https://testserver")
    assert "max-age=31536000" in c.get("/api/x").headers["strict-transport-security"]
    plain = TestClient(make_app(), base_url="http://testserver")
    assert "strict-transport-security" not in plain.get("/api/x").headers
    monkeypatch.setenv("APP_ENV", "development")
    assert "strict-transport-security" not in TestClient(make_app(), base_url="https://testserver").get("/api/x").headers


def test_force_https_redirects_http_but_not_health(monkeypatch):
    monkeypatch.setenv("FORCE_HTTPS", "true")
    monkeypatch.setenv("TRUST_PROXY", "true")
    c = TestClient(make_app(), follow_redirects=False)
    r = c.get("/api/x")
    assert r.status_code == 308 and r.headers["location"].startswith("https://")
    assert c.get("/api/x", headers={"x-forwarded-proto": "https"}).status_code == 200
    assert c.get("/health").status_code == 200
