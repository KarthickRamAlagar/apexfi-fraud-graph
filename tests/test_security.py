from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import security
from backend.security import install_security


def make_app():
    app = FastAPI()
    install_security(app)

    @app.get("/api/x")
    def x():
        return {"ok": True}

    @app.post("/api/x")
    def px(d: dict):
        return d

    @app.get("/api/boom")
    def boom():
        raise RuntimeError("secret internal detail")

    return app


def test_headers_and_request_id():
    r = TestClient(make_app()).get("/api/x")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["x-request-id"]


def test_generic_500():
    r = TestClient(make_app(), raise_server_exceptions=False).get("/api/boom")
    assert r.status_code == 500
    assert "secret" not in r.text
    assert "requestId" in r.json()


def test_body_too_large():
    r = TestClient(make_app()).post("/api/x", content=b"{}" + b" " * 1_100_000,
                                    headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_rate_limit(monkeypatch):
    monkeypatch.setattr(security, "RATE_RULES", [("/api", 3, 60)])
    c = TestClient(make_app())
    codes = [c.get("/api/x").status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3] == 429
    assert "retry-after" in c.get("/api/x").headers


def test_cors_allows_listed_blocks_other(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://good.example,*")
    c = TestClient(make_app())
    ok = c.get("/api/x", headers={"Origin": "http://good.example"})
    bad = c.get("/api/x", headers={"Origin": "http://evil.example"})
    assert ok.headers.get("access-control-allow-origin") == "http://good.example"
    assert "access-control-allow-origin" not in bad.headers
    assert "*" not in security.allowed_origins()
