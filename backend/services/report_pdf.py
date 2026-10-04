"""Builds the downloadable PDF comparison report (reportlab).

The PDF is generated on the SERVER from a freshly computed comparison result
(see comparison_service) -- the browser never supplies the numbers, so the
report cannot contain edited results. All user-supplied text is XML-escaped
before it reaches reportlab's mini-markup parser.
"""
import io
import json
import os
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

DATA_DIR = "streamlit_app/data"

INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#6b7280")
ACCENT = colors.HexColor("#2563eb")
RED = colors.HexColor("#dc2626")
GREEN = colors.HexColor("#16a34a")
LINE = colors.HexColor("#e5e7eb")
SOFT = colors.HexColor("#f3f4f6")


def _load(name):
    try:
        with open(os.path.join(DATA_DIR, name)) as f:
            return json.load(f)
    except Exception:
        return None


def _t(v, limit=80):
    s = "—" if v is None else str(v)
    return escape(s if len(s) <= limit else s[: limit - 1] + "…")


def _r(v, limit=80):
    """Plain text for Table cells (plain strings are NOT parsed as markup, so no escaping)."""
    s = "—" if v is None else str(v)
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _styles():
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=ss["Title"], fontSize=20, textColor=INK, alignment=0, spaceAfter=2),
        "sub": ParagraphStyle("s", parent=ss["Normal"], fontSize=9, textColor=MUTED, spaceAfter=10),
        "h": ParagraphStyle("h", parent=ss["Heading2"], fontSize=12, textColor=INK, spaceBefore=12, spaceAfter=4),
        "p": ParagraphStyle("p", parent=ss["Normal"], fontSize=9, leading=13, textColor=INK),
        "small": ParagraphStyle("sm", parent=ss["Normal"], fontSize=7.5, leading=10, textColor=MUTED),
        "cell": ParagraphStyle("c", parent=ss["Normal"], fontSize=8.5, leading=11, textColor=INK),
    }


def _table(rows, col_widths, header=True):
    t = Table(rows, colWidths=col_widths, hAlign="LEFT")
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), SOFT), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
    t.setStyle(TableStyle(style))
    return t


def _bars(features, width=240 * mm / 1.0, row_h=11):
    """Signed contribution bars: red pushes risk up, green pushes it down."""
    if not features:
        return None
    w = 170 * mm
    h = row_h * len(features) + 6
    d = Drawing(w, h)
    mid = w * 0.62
    maxabs = max(abs(f["contribution"]) for f in features) or 1
    scale = (w * 0.34) / maxabs
    d.add(Line(mid, 0, mid, h, strokeColor=MUTED, strokeWidth=0.5))
    for i, f in enumerate(features):
        y = h - (i + 1) * row_h
        c = f["contribution"]
        bw = abs(c) * scale
        x = mid if c >= 0 else mid - bw
        d.add(Rect(x, y + 2, max(bw, 0.8), row_h - 4, fillColor=RED if c >= 0 else GREEN, strokeColor=None))
        d.add(String(2, y + 3, str(f["feature"])[:28], fontSize=7.5, fillColor=INK))
        d.add(String(w - 2, y + 3, f"{c:+.3f}", fontSize=7.5, fillColor=MUTED, textAnchor="end"))
    return d


def _model_block(S, key_title, m):
    out = [Paragraph(escape(key_title), S["h"])]
    if not m.get("available"):
        out.append(Paragraph(escape(m.get("message", "Unavailable.")), S["p"]))
        return out
    verdict = "FLAGGED as likely fraud" if m["isFlagged"] else "Not flagged (clear)"
    out.append(Paragraph(
        f"<b>{m['riskScore'] * 100:.1f}% risk</b> &nbsp;·&nbsp; {verdict} &nbsp;·&nbsp; threshold {m['threshold'] * 100:.0f}%",
        S["p"]))
    if m.get("componentScores"):
        cs = m["componentScores"]
        out.append(Paragraph(
            f"Component scores: LightGBM {cs.get('lightgbm', 0) * 100:.1f}% · GNN {cs.get('gnn', 0) * 100:.1f}%", S["small"]))
    if m.get("realRollingFeatures"):
        rf = m["realRollingFeatures"]
        out.append(Paragraph(
            "Real rolling-window history (previous hour): "
            f"{rf.get('card1_txn_count_1h', 0):.0f} card transactions, ${rf.get('card1_amount_sum_1h', 0):,.0f} total, "
            f"{rf.get('device_txn_count_1h', 0):.0f} device transactions.", S["small"]))
    out.append(Spacer(1, 3))
    feats = m.get("topContributingFeatures") or []
    d = _bars(feats)
    if d:
        out.append(Paragraph("Top reasons (SHAP, signed — red raises risk, green lowers it):", S["small"]))
        out.append(d)
    return out


def build_comparison_pdf(result: dict) -> bytes:
    S = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm,
                            title="ApexFi Fraud Model Comparison Report", author="ApexFi")
    story = []
    inp = result["input"]
    models = result["models"]
    n, ts = models["nonTimeSeries"], models["timeSeries"]

    story += [Paragraph("ApexFi — Fraud Model Comparison Report", S["title"]),
              Paragraph(f"Generated {_t(result.get('generatedAt'))} (UTC) · research prototype on the public IEEE-CIS benchmark", S["sub"])]

    # 1. Input
    story.append(Paragraph("1. Input", S["h"]))
    if result["kind"] == "investigate":
        rows = [["Transaction", _r(inp["transactionId"]), "Historical label", _r(inp["historicalLabel"])],
                ["Amount (USD)", f"${inp['amount']:,.2f}" if inp.get("amount") is not None else "—", "Product", _r(inp["productCode"])],
                ["Card1", _r(inp["card1"]), "Device", _r(inp["device"])],
                ["Date", _r(inp["date"]), "Input type", "Existing transaction (Investigate)"]]
    else:
        rows = [["Amount (USD)", f"${inp['amount']:,.2f}" if inp.get("amount") is not None else "—", "Product", _r(inp["productCode"])],
                ["Card1 / Card2", f"{_r(inp['card1'])} / {_r(inp['card2'])}", "Addr1", _r(inp["addr1"])],
                ["E-mail domain", _r(inp["emailDomain"]), "Device", _r(inp["device"])],
                ["Input type", "New, unseen transaction (Score New)", "", ""]]
    story.append(_table(rows, [30 * mm, 55 * mm, 30 * mm, 55 * mm], header=False))

    # 2. Verdicts
    story.append(Paragraph("2. Results side by side", S["h"]))
    def row(label, m):
        if not m.get("available"):
            return [Paragraph(escape(label), S["cell"]), "—", "Unavailable", "—"]
        return [Paragraph(escape(label), S["cell"]), f"{m['riskScore'] * 100:.1f}%",
                "FLAGGED" if m["isFlagged"] else "CLEAR", f"{m['threshold'] * 100:.0f}%"]
    story.append(_table([["Model", "Risk", "Verdict", "Threshold"],
                         row(n["label"], n), row(ts["label"], ts)],
                        [90 * mm, 25 * mm, 30 * mm, 25 * mm]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(escape(result["agreement"].get("note", "")), S["p"]))
    if result.get("window"):
        story.append(Paragraph(escape(result["window"]["note"]), S["small"]))

    # 3. Reasons
    story.append(Paragraph("3. Why each model decided this", S["h"]))
    story.append(KeepTogether(_model_block(S, "Non-time-series model", n)))
    story.append(KeepTogether(_model_block(S, "Time-series model", ts)))

    # 4. Model context
    story.append(Paragraph("4. How reliable are these models? (measured results)", S["h"]))
    thr = _load("threshold_optimization.json")
    rnd = _load("random_split_full_metrics.json")
    abl = _load("feature_group_ablation.json")
    if thr and rnd:
        R = rnd["random_split_full_metrics"]
        C = thr["default_threshold_0.5"]
        rows = [["Metric", "Random split (4-feature LightGBM)", "Chronological split (time-series model)"],
                ["ROC-AUC", f"{R['roc_auc']:.4f}", f"{thr['roc_auc']:.4f}"],
                ["PR-AUC", f"{R['pr_auc']:.4f}", f"{thr['pr_auc']:.4f}"],
                ["Precision", f"{R['precision']:.3f}", f"{C['precision']:.3f}"],
                ["Recall", f"{R['recall']:.3f}", f"{C['recall']:.3f}"],
                ["F1", f"{R['f1']:.3f}", f"{C['f1']:.3f}"]]
        story.append(_table(rows, [35 * mm, 65 * mm, 70 * mm]))
        story.append(Paragraph("Default 0.5 threshold. The random split overstates real-world performance because the "
                               "model can learn card/device patterns from the future.", S["small"]))
    if abl and rnd:
        r = rnd["random_split_full_metrics"]["roc_auc"]
        a = abl["group_a_frequency_only"]["roc_auc"]
        c = abl["group_c_combined"]["roc_auc"]
        story.append(Spacer(1, 3))
        story.append(Paragraph(
            f"Like-for-like (ROC-AUC): same 4 features random split {r:.3f} → chronological {a:.3f} "
            f"({a - r:+.3f} from the split alone); adding rolling-window features recovers {c - a:+.3f} → {c:.3f}.", S["p"]))
    story.append(Paragraph(
        "The flagship stacked model (LightGBM + GraphSAGE, 446 features) reports F1 0.798 / ROC-AUC 0.974 on IEEE-CIS "
        "under a random split (3-seed validated). Those are random-split figures and are not comparable with the "
        "chronological numbers above.", S["small"]))

    # 5. Provenance
    story.append(Paragraph("5. Provenance and method", S["h"]))
    prov = [
        ["Dataset", "IEEE-CIS Fraud Detection (Kaggle) · 590,540 transactions · 3.499% fraud · amounts in USD"],
        ["Pipeline", "Bronze → Silver → Gold in PostgreSQL; features and graph edges built in the Gold layer"],
        ["Non-time-series model", "LightGBM + GraphSAGE GNN, logistic stacking, random split, SHAP explanations"],
        ["Time-series model", "LightGBM on 4 frequency features + 3 rolling 1-hour features; chronological 75/25 split "
                              "by transaction time; frequency maps fit on training data only; rolling windows exclude the current time"],
        ["Time-series threshold", "0.6 (operating threshold chosen from a 9-point threshold sweep; max-F1 would be 0.7)"],
        ["Generated", _t(result.get("generatedAt"))],
    ]
    story.append(_table([[Paragraph(f"<b>{escape(a)}</b>", S["cell"]), Paragraph(escape(b), S["cell"])] for a, b in prov],
                        [38 * mm, 132 * mm], header=False))

    # 6. Limitations
    story.append(Paragraph("6. Limitations", S["h"]))
    for line in [
        "Research prototype on a public benchmark dataset; not validated for real-world payment decisions.",
        "The two models differ in architecture, features and split strategy, so their scores are not directly interchangeable.",
        "Many IEEE-CIS features are anonymised, so explanations name feature columns, not business concepts.",
        "Scores are probabilities from a model, not proof of fraud; a flagged transaction needs human review.",
        "Planned, not yet implemented: user authentication/roles and independent out-of-time validation on external data.",
    ]:
        story.append(Paragraph("• " + escape(line), S["p"]))

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 9 * mm, "ApexFi · fraud model comparison · research prototype")
        canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
