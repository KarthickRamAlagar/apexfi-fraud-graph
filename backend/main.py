from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
)

app = FastAPI(title="ApexFi API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/health")
def health():
    return {"status": "ok"}