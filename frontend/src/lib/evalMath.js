// Metrics derived from a confusion matrix {tp, fp, fn, tn}. Used by the Evaluation Metrics page and its PDF.
export function fromCm(cm) {
  const { tp, fp, fn, tn } = cm, P = tp + fn, N = tn + fp
  const precision = tp / Math.max(tp + fp, 1), recall = tp / Math.max(P, 1), spec = tn / Math.max(N, 1)
  const mcc = (tp * tn - fp * fn) / Math.sqrt(Math.max((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn), 1))
  return { precision, recall, f1: (2 * precision * recall) / Math.max(precision + recall, 1e-12), specificity: spec, fpr: 1 - spec, mcc, balanced: (recall + spec) / 2, alert: (tp + fp) / (P + N) }
}
