"""Model toggle / comparison endpoints and the downloadable PDF report.

Both models are run server-side on the same input; the PDF is built from a
freshly computed result (never from numbers supplied by the browser).
"""
import re

from fastapi import APIRouter, HTTPException, Response

from backend.routers.new_transaction import NewTransactionRequest
from backend.services import comparison_service
from backend.services.report_pdf import build_comparison_pdf

router = APIRouter(prefix="/api", tags=["compare"])

_TX_RE = re.compile(r"^(?:TX-)?(\d{1,10})$")


def _parse_tx(transaction_id: str) -> int:
    m = _TX_RE.match(transaction_id.strip())
    if not m:
        raise HTTPException(400, "Invalid transaction ID format — expected TX-<number>")
    return int(m.group(1))


def _existing(transaction_id: str):
    result = comparison_service.compare_existing(_parse_tx(transaction_id))
    if result is None:
        raise HTTPException(404, f"Transaction {transaction_id} not found")
    return result


def _pdf_response(result, filename):
    try:
        pdf = build_comparison_pdf(result)
    except Exception as e:
        print(f"[report] PDF build failed: {type(e).__name__}: {e}")
        raise HTTPException(500, "Could not generate the report.")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


@router.post("/compare/investigate/{transaction_id}")
def compare_investigate(transaction_id: str):
    return _existing(transaction_id)


@router.post("/compare/new")
def compare_new(req: NewTransactionRequest):
    return comparison_service.compare_new(req.model_dump())


@router.get("/report/investigate/{transaction_id}")
def report_investigate(transaction_id: str):
    result = _existing(transaction_id)
    return _pdf_response(result, f"apexfi-comparison-TX-{_parse_tx(transaction_id)}.pdf")


@router.post("/report/new-transaction")
def report_new(req: NewTransactionRequest):
    result = comparison_service.compare_new(req.model_dump())
    return _pdf_response(result, "apexfi-comparison-new-transaction.pdf")
