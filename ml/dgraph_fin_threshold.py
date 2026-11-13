"""Pick an operating threshold for the DGraph-Fin stacked model on the VALIDATION block (F1-optimal), then report the TEST block at it.
At the default 0.5 the corrected model flags nothing, because fraud is only 1.27% of accounts and the scores are low and compressed.
Writes ml/checkpoints/dgraph_fin_threshold.json and app_data/model_metrics_dgraph_fin_operating_point.json.
Run after stack_dgraph_fin:  uv run python -m ml.dgraph_fin_threshold"""
import json, pickle
import lightgbm as lgb, numpy as np, torch
from sklearn.metrics import precision_recall_curve, precision_score, recall_score, f1_score, roc_auc_score, average_precision_score
from ml.model import FraudGraphSAGE
from ml.simple_sampler import SharedEdgeStructure
from ml.stack_dgraph_fin import get_gnn_probs, GRAPH_PATH

def lift(y, p, frac):
    k = max(1, int(len(y) * frac)); top = np.argsort(-p)[:k]
    return float(y[top].mean() / y.mean()), float(y[top].sum() / y.sum())

def main():
    data = torch.load(GRAPH_PATH, weights_only=False)
    lgbm = lgb.Booster(model_file="ml/checkpoints/dgraph_fin_lightgbm.txt")
    ck = torch.load("ml/checkpoints/dgraph_fin_model.pt", weights_only=False)
    gnn = FraudGraphSAGE(in_channels=ck["in_channels"], hidden_channels=ck["hidden_channels"]); gnn.load_state_dict(ck["state_dict"])
    meta = pickle.load(open("ml/checkpoints/dgraph_fin_stacking_meta.pkl", "rb"))
    X, y = data.x.numpy(), data.y.numpy(); vi, ti = data.val_mask.numpy(), data.test_mask.numpy()
    se = SharedEdgeStructure(data.edge_index, data.num_nodes)
    def stacked(mask, idx):
        l = lgbm.predict(X[idx]); g = get_gnn_probs(gnn, data, mask, edge_structure=se)
        return meta.predict_proba(np.stack([l, g], 1))[:, 1]
    pv, pt = stacked(data.val_mask, vi), stacked(data.test_mask, ti); yv, yt = y[vi], y[ti]
    pr, rc, th = precision_recall_curve(yv, pv); f1 = 2 * pr[:-1] * rc[:-1] / np.maximum(pr[:-1] + rc[:-1], 1e-12); thr = float(th[np.argmax(f1)])
    pred = (pt >= thr).astype(int)
    out = dict(threshold=thr, rule="F1-optimal on the validation block", test=dict(
        precision=float(precision_score(yt, pred, zero_division=0)), recall=float(recall_score(yt, pred, zero_division=0)), f1=float(f1_score(yt, pred, zero_division=0)),
        roc_auc=float(roc_auc_score(yt, pt)), pr_auc=float(average_precision_score(yt, pt)), flagged_pct=float(pred.mean() * 100),
        lift_top1=lift(yt, pt, .01)[0], recall_top1=lift(yt, pt, .01)[1], lift_top5=lift(yt, pt, .05)[0], recall_top5=lift(yt, pt, .05)[1]),
        note="Weak by design of the data: published methods also score PR-AUC of only a few percent on DGraph-Fin. Use scores for ranking, not for automatic decisions.")
    json.dump({"threshold": thr}, open("ml/checkpoints/dgraph_fin_threshold.json", "w"))
    json.dump(out, open("app_data/model_metrics_dgraph_fin_operating_point.json", "w"), indent=2); print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
