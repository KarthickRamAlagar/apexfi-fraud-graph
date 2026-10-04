"""
Pre-warms every heavy, singleton model/graph loader ONCE when the
server itself starts, instead of lazily loading on whichever page's
first request happens to trigger it.

Hybrid loading strategy: the two IEEE-CIS-based predictors
(fraud_predictor and new_transaction_predictor_service) each
independently load their own ~1.6GB graph copy -- these load
SEQUENTIALLY, to avoid both peaking in memory at the same moment,
given this machine's real, demonstrated fragility around disk/memory
earlier tonight. The three lighter predictors (DGraph-Fin, Ethereum,
Temporal) load in PARALLEL with each other, since none of them are
large enough to pose the same risk -- this gets a real, meaningful
speedup on 3 of the 5 models without touching the one genuine concern.
"""
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI

from backend.security import install_security, is_production
from backend.routers import (
    dashboard,
    datasets,
    eda,
    analytics,
    investigate,
    ask,
    new_transaction,
    dgraph_fin_score,
    ethereum_fraud,
    temporal_validation,
    compare,
)

_prod = is_production()
app = FastAPI(
    title="ApexFi API",
    docs_url=None if _prod else "/docs",
    redoc_url=None if _prod else "/redoc",
    openapi_url=None if _prod else "/openapi.json",
)

# CORS, security headers, size cap, rate limit, request IDs, generic 500s
install_security(app)

app.include_router(dashboard.router)
app.include_router(datasets.router)
app.include_router(eda.router)
app.include_router(analytics.router)
app.include_router(investigate.router)
app.include_router(ask.router)
app.include_router(new_transaction.router)
app.include_router(dgraph_fin_score.router)
app.include_router(ethereum_fraud.router)
app.include_router(temporal_validation.router)
app.include_router(compare.router)


@app.on_event("startup")
def preload_models():
    print("\n=== Pre-warming real models (hybrid: sequential for the two heavy IEEE-CIS loaders, parallel for the rest) ===")
    start = time.perf_counter()

    # Sequential -- each independently loads its own ~1.6GB IEEE-CIS
    # graph copy; loading one at a time avoids both peaking in memory
    # simultaneously.
    from backend.services.fraud_predictor import get_predictor
    get_predictor()
    print(f"  IEEE-CIS predictor ready ({time.perf_counter() - start:.1f}s elapsed)")

    from backend.services.new_transaction_predictor_service import get_new_transaction_predictor
    get_new_transaction_predictor()
    print(f"  New Transaction predictor ready ({time.perf_counter() - start:.1f}s elapsed)")

    # Parallel -- these three are each meaningfully smaller, so loading
    # them concurrently is a real, safe speedup.
    def load_dgraph():
        from backend.services.dgraph_fin_predictor_service import get_dgraph_fin_predictor
        get_dgraph_fin_predictor()
        return "DGraph-Fin"

    def load_ethereum():
        from backend.services.ethereum_fraud_predictor_service import get_ethereum_fraud_predictor
        get_ethereum_fraud_predictor()
        return "Ethereum"

    def load_temporal():
        from backend.services.temporal_predictor_service import get_temporal_predictor
        get_temporal_predictor()
        return "Temporal"

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(f) for f in (load_dgraph, load_ethereum, load_temporal)]
        for future in futures:
            name = future.result()
            print(f"  {name} predictor ready ({time.perf_counter() - start:.1f}s elapsed)")

    print(f"=== All real models pre-warmed in {time.perf_counter() - start:.1f}s total ===\n")


@app.get("/health")
def health():
    return {"status": "ok"}