// SVG charts for evaluation and EDA. Plain SVG, theme colours, hover read-outs. Every value drawn comes from the data passed in.
import { useId, useState } from "react";
import { C } from "./Kit";

const f = (v, d = 2) => (v == null || Number.isNaN(v) ? "No data" : Math.abs(v) >= 1000 ? Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }) : Number(v).toFixed(d));
export const SERIES = { v2: "rgb(var(--signal-teal))", v1: "rgb(var(--signal-amber))", ref: "rgb(var(--ink-500))", fraud: "rgb(var(--signal-red))", normal: "rgb(var(--signal-sky))", background: "rgb(var(--ink-400))" };

function Legend({ items }) {
  return <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-300">{items.map((i) => <span key={i.name} className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm" style={{ background: i.color }} />{i.name}</span>)}</div>;
}

/** Line chart on a 0..1 (or custom) grid. series: [{name,color,xs,ys,dash}], marks: [{x,y,label,color}] */
export function XYChart({ series, marks = [], xLabel, yLabel, diag = false, xMax = 1, yMax = 1, label, height = 300, fmtX = (v) => v.toFixed(1), fmtY = (v) => v.toFixed(1) }) {
  const W = 520, H = height, L = 46, R = 14, T = 12, B = 38, [hi, setHi] = useState(null);
  const X = (v) => L + ((W - L - R) * v) / xMax, Y = (v) => H - B - ((H - B - T) * v) / yMax;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); setHi(Math.max(0, Math.min(xMax, (((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * xMax))); };
  const near = hi == null ? null : series.map((s) => { let b = 0, bd = 9; s.xs.forEach((x, i) => { const d = Math.abs(x - hi); if (d < bd) { bd = d; b = i; } }); return { name: s.name, color: s.color, x: s.xs[b], y: s.ys[b] }; });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        {ticks.map((t) => <g key={t}>
          <line x1={L} x2={W - R} y1={Y(t * yMax)} y2={Y(t * yMax)} stroke={C.grid} /><text x={L - 6} y={Y(t * yMax) + 4} fontSize="11" textAnchor="end" fill={C.muted}>{fmtY(t * yMax)}</text>
          <line x1={X(t * xMax)} x2={X(t * xMax)} y1={T} y2={H - B} stroke={C.grid} strokeOpacity="0.45" /><text x={X(t * xMax)} y={H - B + 15} fontSize="11" textAnchor="middle" fill={C.muted}>{fmtX(t * xMax)}</text>
        </g>)}
        {diag && <line x1={X(0)} y1={Y(0)} x2={X(xMax)} y2={Y(yMax)} stroke={SERIES.ref} strokeDasharray="4 4" />}
        {series.map((s) => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeDasharray={s.dash} points={s.xs.map((x, i) => `${X(x)},${Y(s.ys[i])}`).join(" ")} />)}
        {marks.map((m) => <g key={m.label}><circle cx={X(m.x)} cy={Y(m.y)} r="5" fill={m.color} stroke="rgb(var(--ink-900))" strokeWidth="2" /></g>)}
        <text x={(L + W - R) / 2} y={H - 4} fontSize="12" textAnchor="middle" fill={C.text}>{xLabel}</text>
        <text transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} fontSize="12" textAnchor="middle" fill={C.text}>{yLabel}</text>
        {near && <g pointerEvents="none"><line x1={X(hi)} x2={X(hi)} y1={T} y2={H - B} stroke={C.text} strokeDasharray="3 3" />
          <g transform={`translate(${Math.min(X(hi) + 8, W - 170)},${T + 4})`}><rect width="160" height={10 + near.length * 17} rx="6" fill="rgb(var(--ink-950))" stroke={C.grid} />
            {near.map((n, k) => <text key={n.name} x="8" y={17 + k * 17} fontSize="11.5" fill={n.color}>{n.name}: {fmtX(n.x)} , {fmtY(n.y)}</text>)}</g></g>}
      </svg>
      <Legend items={[...series.map((s) => ({ name: s.name, color: s.color })), ...marks.map((m) => ({ name: m.label, color: m.color }))]} />
    </div>
  );
}

/** Grouped vertical bars. cats: labels; series: [{name,color,values}]. */
export function GroupedBars({ cats, series, fmt = (v) => f(v, 2), label, height = 260, yMax, yLabel }) {
  const W = 560, H = height, L = 46, R = 10, T = 10, B = 56;
  const max = yMax || Math.max(...series.flatMap((s) => s.values.filter((v) => v != null)), 1e-9) * 1.1;
  const gw = (W - L - R) / cats.length, bw = Math.min(26, (gw - 8) / series.length);
  const Y = (v) => H - B - ((H - B - T) * v) / max;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={L} x2={W - R} y1={Y(max * t)} y2={Y(max * t)} stroke={C.grid} /><text x={L - 6} y={Y(max * t) + 4} fontSize="11" textAnchor="end" fill={C.muted}>{fmt(max * t)}</text></g>)}
        {cats.map((c, i) => {
          const x0 = L + i * gw + (gw - bw * series.length) / 2;
          return <g key={c}>
            {series.map((s, k) => s.values[i] == null ? null : <rect key={s.name} x={x0 + k * bw} y={Y(s.values[i])} width={bw - 2} height={H - B - Y(s.values[i])} rx="2" fill={s.color}><title>{`${c} · ${s.name}: ${fmt(s.values[i])}`}</title></rect>)}
            <text transform={`translate(${L + i * gw + gw / 2} ${H - B + 12}) rotate(-28)`} fontSize="10.5" textAnchor="end" fill={C.text}>{c.length > 20 ? c.slice(0, 19) + "…" : c}</text>
          </g>;
        })}
        {yLabel && <text transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} fontSize="12" textAnchor="middle" fill={C.text}>{yLabel}</text>}
      </svg>
      {series.length > 1 && <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />}
    </div>
  );
}

/** Two overlaid histograms on a log count axis (fraud vs normal score). */
export function DualHist({ edges, a, b, aName, bName, aColor, bColor, label, height = 240, xLabel = "Model score" }) {
  const W = 520, H = height, L = 46, R = 10, T = 10, B = 36, n = a.length;
  const lg = (v) => Math.log10(v + 1), max = Math.max(...a.map(lg), ...b.map(lg), 1) * 1.05;
  const bw = (W - L - R) / n, Y = (v) => H - B - ((H - B - T) * lg(v)) / max;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 1, 2, 3, 4, 5].filter((p) => p <= max + 0.1).map((p) => <g key={p}><line x1={L} x2={W - R} y1={H - B - ((H - B - T) * p) / max} y2={H - B - ((H - B - T) * p) / max} stroke={C.grid} /><text x={L - 6} y={H - B - ((H - B - T) * p) / max + 4} fontSize="11" textAnchor="end" fill={C.muted}>{p === 0 ? "0" : Math.pow(10, p).toLocaleString("en-US")}</text></g>)}
        {a.map((_, i) => <g key={i}><rect x={L + i * bw + 1} y={Y(b[i])} width={bw / 2 - 1} height={H - B - Y(b[i])} fill={bColor}><title>{`${edges[i]} to ${edges[i + 1]} · ${bName}: ${b[i].toLocaleString()}`}</title></rect>
          <rect x={L + i * bw + bw / 2} y={Y(a[i])} width={bw / 2 - 1} height={H - B - Y(a[i])} fill={aColor}><title>{`${edges[i]} to ${edges[i + 1]} · ${aName}: ${a[i].toLocaleString()}`}</title></rect></g>)}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <text key={t} x={L + (W - L - R) * t} y={H - B + 15} fontSize="11" textAnchor="middle" fill={C.muted}>{t}</text>)}
        <text x={(L + W - R) / 2} y={H - 4} fontSize="12" textAnchor="middle" fill={C.text}>{xLabel}</text>
        <text transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} fontSize="12" textAnchor="middle" fill={C.text}>Transactions (log scale)</text>
      </svg>
      <Legend items={[{ name: aName, color: aColor }, { name: bName, color: bColor }]} />
    </div>
  );
}

/** 2x2 confusion matrix with counts and row shares. */
export function ConfusionTiles({ cm, title }) {
  const { tp, fp, fn, tn } = cm, P = tp + fn, N = tn + fp;
  const cell = (v, name, share, good) => (
    <div className={`rounded-lg border p-3 text-center ${good ? "border-signal-teal/40 bg-signal-teal/10" : "border-signal-red/40 bg-signal-red/10"}`}>
      <p className="font-display text-[22px] font-semibold tabular-nums text-foreground">{v.toLocaleString("en-US")}</p>
      <p className="text-[12px] text-ink-200">{name}</p><p className="text-[11.5px] text-ink-400">{share}</p>
    </div>);
  return (
    <div>
      {title && <p className="mb-2 text-[13px] font-medium text-foreground">{title}</p>}
      <div className="grid grid-cols-[auto_1fr_1fr] items-stretch gap-2 text-[11.5px] text-ink-400">
        <span /><span className="text-center">Model says normal</span><span className="text-center">Model says fraud</span>
        <span className="self-center [writing-mode:vertical-rl] rotate-180">Really normal</span>{cell(tn, "True negatives", `${((tn / N) * 100).toFixed(1)}% of normal`, true)}{cell(fp, "False alarms", `${((fp / N) * 100).toFixed(2)}% of normal`, false)}
        <span className="self-center [writing-mode:vertical-rl] rotate-180">Really fraud</span>{cell(fn, "Missed frauds", `${((fn / P) * 100).toFixed(1)}% of fraud`, false)}{cell(tp, "Caught frauds", `${((tp / P) * 100).toFixed(1)}% of fraud`, true)}
      </div>
    </div>
  );
}

/** Correlation (or any -1..1) heatmap. */
export function Heatmap({ labels, matrix, label, cell = 34 }) {
  const n = labels.length, pad = 96, W = pad + n * cell + 8, H = pad + n * cell + 8, [hi, setHi] = useState(null);
  const col = (v) => { if (v == null) return "rgb(var(--ink-800))"; const a = Math.min(1, Math.abs(v)); return v >= 0 ? `rgba(45,212,191,${0.08 + a * 0.85})` : `rgba(248,113,113,${0.08 + a * 0.85})`; };
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 520) }} className="h-auto w-full" role="img" aria-label={label}>
        {labels.map((l, i) => <g key={l}>
          <text x={pad - 6} y={pad + i * cell + cell / 2 + 4} fontSize="10.5" textAnchor="end" fill={C.text}>{l.length > 13 ? l.slice(0, 12) + "…" : l}</text>
          <text transform={`translate(${pad + i * cell + cell / 2} ${pad - 6}) rotate(-60)`} fontSize="10.5" fill={C.text}>{l.length > 13 ? l.slice(0, 12) + "…" : l}</text>
        </g>)}
        {matrix.map((row, i) => row.map((v, j) => <g key={`${i}-${j}`} onMouseEnter={() => setHi([i, j])} onMouseLeave={() => setHi(null)}>
          <rect x={pad + j * cell} y={pad + i * cell} width={cell - 1.5} height={cell - 1.5} rx="3" fill={col(v)} stroke={hi && hi[0] === i && hi[1] === j ? "rgb(var(--ink-100))" : "none"} />
          {cell >= 30 && v != null && <text x={pad + j * cell + cell / 2} y={pad + i * cell + cell / 2 + 3.5} fontSize="9.5" textAnchor="middle" fill="rgb(var(--ink-100))">{v.toFixed(2)}</text>}
          <title>{`${labels[i]} × ${labels[j]}: ${v == null ? "No data" : v.toFixed(3)}`}</title></g>))}
      </svg>
      <p className="mt-1 text-[12px] text-ink-400">{hi ? `${labels[hi[0]]} × ${labels[hi[1]]}: ${matrix[hi[0]][hi[1]] == null ? "No data" : matrix[hi[0]][hi[1]].toFixed(3)}` : "Teal = move together, red = move opposite. Hover a square for the exact value."}</p>
    </div>
  );
}

/** Horizontal box plots, one row per class. rows: [{label, color, q1,median,q3,whisker_low,whisker_high,n,outliers,mean}] */
export function BoxRows({ rows, logScale = false, label }) {
  const W = 560, L = 96, R = 16, rowH = 34, H = rows.length * rowH + 30, T = 6;
  const tr = (v) => (logScale ? Math.log10(Math.max(v, 0) + 1) : v);
  const lo = Math.min(...rows.map((r) => tr(r.whisker_low))), hi = Math.max(...rows.map((r) => tr(r.whisker_high)));
  const span = hi - lo || 1, X = (v) => L + ((W - L - R) * (tr(v) - lo)) / span;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + span * t), back = (t) => (logScale ? Math.pow(10, t) - 1 : t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((t) => <g key={t}><line x1={L + ((W - L - R) * (t - lo)) / span} x2={L + ((W - L - R) * (t - lo)) / span} y1={T} y2={H - 22} stroke={C.grid} strokeOpacity="0.6" /><text x={L + ((W - L - R) * (t - lo)) / span} y={H - 6} fontSize="10.5" textAnchor="middle" fill={C.muted}>{f(back(t), 1)}</text></g>)}
      {rows.map((r, i) => { const y = T + i * rowH + 6; return (
        <g key={r.label}>
          <text x={L - 8} y={y + 12} fontSize="11.5" textAnchor="end" fill={C.text}>{r.label}</text>
          <line x1={X(r.whisker_low)} x2={X(r.whisker_high)} y1={y + 9} y2={y + 9} stroke={r.color} strokeWidth="1.6" />
          <rect x={X(r.q1)} y={y} width={Math.max(2, X(r.q3) - X(r.q1))} height="18" rx="3" fill={r.color} fillOpacity="0.28" stroke={r.color} strokeWidth="1.6"><title>{`${r.label}: median ${f(r.median)} · Q1 ${f(r.q1)} · Q3 ${f(r.q3)} · n=${r.n.toLocaleString()} · outliers ${r.outliers}`}</title></rect>
          <line x1={X(r.median)} x2={X(r.median)} y1={y} y2={y + 18} stroke="rgb(var(--ink-100))" strokeWidth="2.2" />
          <circle cx={X(r.mean)} cy={y + 9} r="3" fill="none" stroke="rgb(var(--ink-100))" strokeWidth="1.4" />
        </g>); })}
    </svg>
  );
}

/** Scatter plot; points: [x,y,class]. */
export function Scatter({ points, xLabel, yLabel, colors, logX = false, logY = false, label, height = 340 }) {
  const W = 560, H = height, L = 56, R = 14, T = 10, B = 40, uid = useId();
  const tx = (v) => (logX ? Math.log10(Math.max(v, 0) + 1) : v), ty = (v) => (logY ? Math.log10(Math.max(v, 0) + 1) : v);
  const xs = points.map((p) => tx(p[0])), ys = points.map((p) => ty(p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (v) => L + ((W - L - R) * (tx(v) - x0)) / (x1 - x0 || 1), Y = (v) => H - B - ((H - B - T) * (ty(v) - y0)) / (y1 - y0 || 1);
  const back = (t, lg) => (lg ? Math.pow(10, t) - 1 : t);
  const classes = [...new Set(points.map((p) => p[2]))].sort((a, b) => (a === "fraud") - (b === "fraud"));   // fraud drawn last, on top
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}>
          <line x1={L} x2={W - R} y1={H - B - (H - B - T) * t} y2={H - B - (H - B - T) * t} stroke={C.grid} strokeOpacity="0.6" /><text x={L - 6} y={H - B - (H - B - T) * t + 4} fontSize="10.5" textAnchor="end" fill={C.muted}>{f(back(y0 + (y1 - y0) * t, logY), 1)}</text>
          <text x={L + (W - L - R) * t} y={H - B + 15} fontSize="10.5" textAnchor="middle" fill={C.muted}>{f(back(x0 + (x1 - x0) * t, logX), 1)}</text></g>)}
        {classes.map((c) => <g key={uid + c}>{points.filter((p) => p[2] === c).map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={c === "fraud" ? 3.4 : 2.4} fill={colors[c] || SERIES.background} fillOpacity={c === "fraud" ? 0.9 : 0.45} />)}</g>)}
        <text x={(L + W - R) / 2} y={H - 4} fontSize="12" textAnchor="middle" fill={C.text}>{xLabel}{logX ? " (log scale)" : ""}</text>
        <text transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} fontSize="12" textAnchor="middle" fill={C.text}>{yLabel}{logY ? " (log scale)" : ""}</text>
      </svg>
      <Legend items={classes.map((c) => ({ name: c, color: colors[c] || SERIES.background }))} />
    </div>
  );
}
