"""Tests for the model comparison + PDF endpoints, using stand-in predictors
and a fake database (no Postgres, torch or model checkpoints needed)."""
import sys
import types
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class _Row(SimpleNamespace):
    @property
    def _mapping(self):
        return self.__dict__


class _Conn:
    def __enter__(self): return self
    def __exit__(self, *a): return False

    def execute(self, q, params=None):
        sql = str(q)
        if "percentile_disc" in sql:
            return SimpleNamespace(fetchone=lambda: SimpleNamespace(split_dt=10_000_000, min_dt=86400, max_dt=15_000_000))
        if "WHERE transactionid" in sql:
            if params["id"] == 111:
                row = _Row(transactionid=111, transactionamt=83.74, productcd="C", card1=3887, card2=float("nan"),
                           addr1=None, p_emaildomain="gmail.com", deviceinfo=None, transactiondt=5_000_000,
                           transaction_date="2017-12-03", is_fraud=True)
            elif params["id"] == 222:
                row = _Row(transactionid=222, transactionamt=10.0, productcd="W", card1=9500, card2=360.0,
                           addr1=441.0, p_emaildomain="<b>x</b>", deviceinfo="KFFOWI", transactiondt=14_000_000,
                           transaction_date="2018-05-01", is_fraud=False)
            else:
                row = None
            return SimpleNamespace(fetchone=lambda: row)
        raise AssertionError(sql)


class _Engine:
    def connect(self): return _Conn()


def _feat(name, c): return {"feature": name, "value": 1.0, "contribution": c}


class _Flagship:
    def predict(self, x, threshold=0.5):
        score = 0.9 if x in (111,) or (isinstance(x, dict) and x.get("transactionamt", 0) > 500) else 0.1
        return {"riskScore": score, "isFlagged": score >= threshold, "threshold": threshold,
                "componentScores": {"lightgbm": score, "gnn": score / 2},
                "topContributingFeatures": [_feat("c1", 0.4), _feat("d1", -0.2)],
                "modelInfo": {"type": "stacked", "note": "n"}}


class _Temporal:
    seen = None
    def predict(self, raw, threshold=0.5):
        _Temporal.seen = (raw, threshold)
        return {"riskScore": 0.3, "isFlagged": 0.3 >= threshold, "threshold": threshold,
                "realRollingFeatures": {"card1_txn_count_1h": 2.0, "card1_amount_sum_1h": 40.0, "device_txn_count_1h": 0.0},
                "topContributingFeatures": [_feat("card1_freq", -0.3)], "modelInfo": {"type": "t", "note": "n"}}


@pytest.fixture()
def client(monkeypatch):
    sys.modules["backend.db"] = types.SimpleNamespace(engine=_Engine())
    fp = types.ModuleType("backend.services.fraud_predictor"); fp.get_predictor = lambda: _Flagship()
    nt = types.ModuleType("backend.services.new_transaction_predictor_service"); nt.get_new_transaction_predictor = lambda: _Flagship()
    tp = types.ModuleType("backend.services.temporal_predictor_service"); tp.get_temporal_predictor = lambda: _Temporal()
    for name, mod in [("fraud_predictor", fp), ("new_transaction_predictor_service", nt), ("temporal_predictor_service", tp)]:
        monkeypatch.setitem(sys.modules, f"backend.services.{name}", mod)
    from backend.services import comparison_service
    comparison_service._split_cache.clear()
    from backend.routers import compare
    app = FastAPI(); app.include_router(compare.router)
    return TestClient(app)


def test_investigate_disagreement_and_window(client):
    r = client.post("/api/compare/investigate/TX-111")
    assert r.status_code == 200
    d = r.json()
    assert d["models"]["nonTimeSeries"]["isFlagged"] is True
    assert d["models"]["timeSeries"]["isFlagged"] is False          # 0.3 < 0.6
    assert d["models"]["timeSeries"]["threshold"] == 0.6
    assert d["agreement"]["agree"] is False
    assert d["window"]["inTimeSeriesTrainingWindow"] is True        # 5.0M <= 10M
    raw, thr = _Temporal.seen
    assert raw["card1"] == 3887 and raw["card2"] is None and raw["transactiondt"] == 5_000_000  # NaN cleaned


def test_investigate_test_window_and_whole_floats(client):
    d = client.post("/api/compare/investigate/222").json()
    assert d["window"]["inTimeSeriesTrainingWindow"] is False
    raw, _ = _Temporal.seen
    assert raw["card2"] == 360 and isinstance(raw["card2"], int) and raw["addr1"] == 441


def test_bad_and_missing_ids(client):
    assert client.post("/api/compare/investigate/abc").status_code == 400
    assert client.post("/api/compare/investigate/TX-99999").status_code == 404
    assert client.post("/api/compare/investigate/" + "9" * 40).status_code == 400


def test_new_transaction_compare_and_validation(client):
    ok = client.post("/api/compare/new", json={"transactionamt": 700, "productcd": "W", "card1": 9500, "p_emaildomain": "gmail.com"})
    assert ok.status_code == 200 and ok.json()["models"]["nonTimeSeries"]["isFlagged"] is True
    assert client.post("/api/compare/new", json={"transactionamt": -5, "productcd": "W"}).status_code == 422


def test_one_model_down_is_reported_not_leaked(client, monkeypatch):
    def boom(): raise RuntimeError("secret internal path /opt/x")
    monkeypatch.setattr(sys.modules["backend.services.temporal_predictor_service"], "get_temporal_predictor", boom)
    d = client.post("/api/compare/investigate/111").json()
    ts = d["models"]["timeSeries"]
    assert ts["available"] is False and "secret" not in str(ts)
    assert d["agreement"]["comparable"] is False


def test_pdf_investigate_and_new_with_escaping(client):
    from pypdf import PdfReader
    import io
    r = client.get("/api/report/investigate/TX-222")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content[:5] == b"%PDF-"
    text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages)
    assert "Model Comparison Report" in text and "Limitations" in text and "TX-222" in text
    r2 = client.post("/api/report/new-transaction", json={"transactionamt": 55.5, "productcd": "W", "deviceinfo": "A&B <i>x</i>"})
    assert r2.status_code == 200 and r2.content[:5] == b"%PDF-"
    text2 = "".join(p.extract_text() for p in PdfReader(io.BytesIO(r2.content)).pages)
    assert "A&B <i>x</i>" in text2          # user text escaped, shown literally (no markup injection)
