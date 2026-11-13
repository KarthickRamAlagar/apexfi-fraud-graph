// The ONE template for every ApexFi PDF. Same look as the DEM (AETHER GIS) reports:
// white pages, a dark border, the app name top-left in blue, serif headings with a short blue underline,
// pale stat tiles, mint highlighted table rows, page numbers bottom-centre, "Developed by" icons on the last page.
// Used by: V2 Evaluation, Score New Transaction, Score Unlabeled Account, Ops snapshot.
// Standard PDF fonts only, so no font file is embedded.
import { jsPDF } from "jspdf";
import { DEVELOPER_GITHUB_URL, DEVELOPER_LINKEDIN_URL, makeIconPng } from "@/lib/developerLinks";

export const DEV_NAME = "Karthickramalagar";
const iconCache = {};
const icon = (k) => { if (!(k in iconCache)) { try { iconCache[k] = makeIconPng(k); } catch { iconCache[k] = null; } } return iconCache[k]; };

export const APP_NAME = "ApexFi";
export const COL = {
  blue: [37, 99, 235], amber: [180, 112, 12], ink: [15, 23, 42], grey: [110, 118, 130], text: [60, 66, 78],
  border: [8, 9, 11], red: [185, 28, 28], green: [21, 128, 61], violet: [124, 58, 237], orange: [245, 158, 11],
  teal: [13, 148, 136], mint: [230, 242, 239], panel: [248, 250, 252], line: [210, 216, 224],
};
export const DISCLAIMER_LINE = "Research prototype. Results come from public datasets (IEEE-CIS, DGraph-Fin) and are not a decision on any real account. Please cross-verify the figures.";
export const clean = (t) => String(t ?? "")
  .replace(/²/g, "2").replace(/→/g, "to").replace(/[–—]/g, "-").replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"').replace(/≈/g, "about").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/₹/g, "INR ");
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? "No data" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }));
export const money = (v, cur) => (v == null ? "No data" : cur === "NPR" ? `NPR ${num(v / 1e6, 1)} million` : `INR ${num(v / 1e7, 1)} crore`);
export const range = (a, b, f) => (a == null && b == null ? "No data" : a === b ? f(a) : `${f(a)} to ${f(b)}`);
// a measured number printed with a fixed number of decimals; text and missing values are left alone
export const dec = (v, dp = 4) => (v == null || v === "" ? "Not used by model" : typeof v === "number" ? (Number.isNaN(v) ? "Not used by model" : (Number.isInteger(v) ? String(v) : v !== 0 && Math.abs(v) < 0.5 * 10 ** -dp ? v.toExponential(2) : v.toFixed(dp))) : String(v));

// One document factory for all reports. compress:true is the big size saver: jsPDF writes everything uncompressed without it.
export function newReportDoc() { return new jsPDF({ unit: "mm", format: "a4", compress: true }); }

const imgType = (u) => (/^data:image\/jpe?g/i.test(u) ? "JPEG" : "PNG");

export class Flow {
  constructor(doc, { label = "Report", date = null } = {}) {
    this.doc = doc; this.label = label;
    this.W = 210; this.H = 297; this.M = 14; this.CW = 210 - 28; this.TOP = 24; this.BOTTOM = 262;
    const t = date ? new Date(date) : new Date();
    this.date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    this.y = this.TOP; this.sections = []; this.chrome();
  }
  get n() { return this.doc.getNumberOfPages(); }
  chrome() {
    const d = this.doc, { W, H, M } = this;
    d.setFillColor(255, 255, 255); d.rect(0, 0, W, H, "F");
    d.setDrawColor(...COL.border); d.setLineWidth(1.2); d.rect(5, 5, W - 10, H - 10); d.setLineWidth(0.2);
    d.setFont("helvetica", "bold"); d.setFontSize(10); d.setTextColor(...COL.blue); d.text(APP_NAME, M, 13);
    d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(...COL.grey); d.text(this.date, W - M, 13, { align: "right" });
    d.setDrawColor(...COL.blue); d.line(M, 16, W - M, 16);
    d.setFontSize(8); d.setTextColor(140, 140, 140); d.text(`${APP_NAME}  ${this.label}`, M, 285);
  }
  newPage() { this.doc.addPage(); this.chrome(); this.y = this.TOP; return this; }
  need(h) { if (this.y + h > this.BOTTOM) this.newPage(); }
  // A section FLOWS on from the one before. It moves to a fresh page only when less than minSpace mm is left,
  // so a heading never sits alone at the foot of a page and pages are not left mostly empty. Listed in the contents.
  section(title, { index = true, level = 1, minSpace = 75 } = {}) {
    if (this.y > this.TOP + 0.5) { if (this.BOTTOM - this.y < minSpace) this.newPage(); else this.y += 5; }
    if (index || this.indexAll) this.sections.push({ title, page: this.n, level });
    this.h1(title);
  }
  h1(t) { this.need(14); const d = this.doc; d.setFont("times", "bold"); d.setFontSize(17); d.setTextColor(...COL.ink); d.text(clean(t), this.M, this.y); this.y += 8; }
  title(t, sub, line) {
    const d = this.doc, { M } = this;
    d.setFont("times", "bold"); d.setFontSize(24); d.setTextColor(...COL.ink); d.text(clean(t), M, this.y + 5); this.y += 11;
    if (sub) { d.setFont("helvetica", "italic"); d.setFontSize(9.5); d.setTextColor(...COL.grey); d.text(clean(sub), M, this.y); this.y += 7; }
    if (line) this.para(line, { size: 8, color: COL.grey });
  }
  h2(t) {
    this.need(32); this.y += 3; const d = this.doc;
    d.setFont("times", "bold"); d.setFontSize(13); d.setTextColor(...COL.ink); d.text(clean(t), this.M, this.y);
    d.setDrawColor(...COL.blue); d.setLineWidth(0.5); d.line(this.M, this.y + 1.6, this.M + 14, this.y + 1.6); d.setLineWidth(0.2);
    this.y += 6.5;
  }
  para(t, { size = 8.5, color = COL.text, italic = false, gap = 1.5, bold = false } = {}) {
    const d = this.doc; d.setFont("helvetica", bold ? "bold" : italic ? "italic" : "normal"); d.setFontSize(size); d.setTextColor(...color);
    d.splitTextToSize(clean(t), this.CW).forEach((ln) => { this.need(size * 0.45 + 1); d.text(ln, this.M, this.y); this.y += size * 0.45 + 0.8; });
    this.y += gap;
  }
  bullet(t, color = COL.blue) {
    const d = this.doc; d.setFont("helvetica", "normal"); d.setFontSize(8.5);
    const lines = d.splitTextToSize(clean(t), this.CW - 6);
    this.need(lines.length * 4.2 + 1);
    d.setFillColor(...color); d.circle(this.M + 1.2, this.y - 1, 0.9, "F"); d.setTextColor(...COL.text);
    lines.forEach((ln) => { d.text(ln, this.M + 5, this.y); this.y += 4.1; }); this.y += 1;
  }
  // cols: [{label, key | idx, w, left, fmt}] rows: objects or arrays. highlight(row) -> "win"
  table(cols, rows, { highlight = null, size = 7.5, wrap = true } = {}) {
    const d = this.doc, { M, CW } = this, tw = cols.reduce((a, c) => a + (c.w || 1), 0);
    const widths = cols.map((c) => ((c.w || 1) / tw) * CW), xs = []; let acc = M; widths.forEach((w) => { xs.push(acc); acc += w; });
    const cell = (c, r, i) => { const v = Array.isArray(r) ? r[i] : r[c.key]; const t = c.fmt ? c.fmt(v, r) : v; return t == null ? "-" : clean(t); };
    const head = () => {
      this.need(16); d.setFillColor(240, 244, 248); d.rect(M, this.y - 3.6, CW, 5, "F");
      d.setFont("helvetica", "bold"); d.setFontSize(size); d.setTextColor(...COL.ink);
      cols.forEach((c, i) => d.text(clean(c.label), c.left ? xs[i] + 1 : xs[i] + widths[i] - 1, this.y, { align: c.left ? "left" : "right" }));
      this.y += 5;
    };
    head();
    rows.forEach((r) => {
      const h = highlight ? highlight(r) : null;
      d.setFont("helvetica", h === "win" ? "bold" : "normal"); d.setFontSize(size);
      const cells = cols.map((c, i) => { const t = cell(c, r, i); return c.left && wrap ? d.splitTextToSize(t, widths[i] - 2) : [t]; });
      const rh = Math.max(5, Math.max(...cells.map((l) => l.length)) * (size * 0.42) + 1.8);
      if (this.y + rh > this.BOTTOM) { this.newPage(); head(); d.setFont("helvetica", h === "win" ? "bold" : "normal"); d.setFontSize(size); }
      if (h === "win") { d.setFillColor(214, 244, 238); d.rect(M, this.y - 3.6, CW, rh, "F"); }
      d.setTextColor(...COL.ink);
      cols.forEach((c, i) => { if (c.left) d.text(cells[i], xs[i] + 1, this.y); else d.text(cells[i][0], xs[i] + widths[i] - 1, this.y, { align: "right" }); });
      d.setDrawColor(225, 229, 235); d.line(M, this.y - 3.6 + rh, M + CW, this.y - 3.6 + rh); this.y += rh;
    });
    this.y += 3;
  }
  // a two-column "name, value" table with the value wrapped (for inputs, settings, assumptions)
  kv(rows, { w = [0.36, 0.64], head = ["Item", "Value"] } = {}) {
    this.table([{ label: head[0], idx: 0, left: true, w: w[0] }, { label: head[1], idx: 1, left: true, w: w[1] }], rows.map((r) => [r[0], r[1]]));
  }
  kpi(items) {
    const d = this.doc, { M, CW } = this; this.need(20);
    const n = items.length, gap = 3, w = (CW - gap * (n - 1)) / n;
    items.forEach((it, i) => {
      const x = M + i * (w + gap), y = this.y;
      d.setDrawColor(...COL.line); d.setFillColor(...COL.panel); d.roundedRect(x, y, w, 17, 2, 2, "FD");
      d.setFont("helvetica", "normal"); d.setFontSize(6.5); d.setTextColor(...COL.grey); d.text(clean(it.label).toUpperCase(), x + 3, y + 5);
      const v = clean(it.value), sz = v.length > 26 ? 7.5 : v.length > 18 ? 9 : v.length > 12 ? 10.5 : 12;
      d.setFont("helvetica", "bold"); d.setFontSize(sz); d.setTextColor(...(it.color || COL.ink)); d.text(d.splitTextToSize(v, w - 5)[0], x + 3, y + 11.5);
      d.setFont("helvetica", "normal"); d.setFontSize(6); d.setTextColor(...COL.grey); d.text(d.splitTextToSize(clean(it.sub || ""), w - 5)[0] || "", x + 3, y + 15.2);
    });
    this.y += 21;
  }
  // green-bordered decision card with up to three small cards inside
  decision({ badge, headline, sub, cards = [], color = COL.green }) {
    const d = this.doc, { M, CW } = this; this.need(60); const y = this.y;
    d.setDrawColor(...color); d.setLineWidth(0.5); d.roundedRect(M, y, CW, 47, 2, 2); d.setLineWidth(0.2);
    d.setFont("helvetica", "bold"); d.setFontSize(7.5); d.setTextColor(...color); d.text(clean(badge), M + 4, y + 5.5);
    d.setFont("times", "bold"); d.setFontSize(15); d.setTextColor(...COL.ink); d.text(clean(headline), M + 4, y + 12.5);
    d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(...COL.text); d.text(clean(sub), M + 4, y + 17.5);
    const bw = (CW - 8 - 4 * (cards.length - 1)) / Math.max(1, cards.length);
    cards.forEach((c, i) => {
      const bx = M + 4 + i * (bw + 4);
      d.setDrawColor(200, 205, 214); d.roundedRect(bx, y + 20.5, bw, 23.5, 1.2, 1.2);
      d.setFont("helvetica", "normal"); d.setFontSize(6.5); d.setTextColor(...COL.grey); d.text(clean(c.label), bx + 2, y + 24);
      d.setFont("helvetica", "bold"); d.setFontSize(7.5); d.setTextColor(...COL.ink); d.text(d.splitTextToSize(clean(c.title), bw - 4).slice(0, 2), bx + 2, y + 28);
      d.setFontSize(8.5); d.setTextColor(...COL.blue); d.text(d.splitTextToSize(clean(c.value), bw - 4)[0], bx + 2, y + 36);
      d.setFont("helvetica", "normal"); d.setFontSize(6); d.setTextColor(...COL.text); d.text(d.splitTextToSize(clean(c.text), bw - 4).slice(0, 2), bx + 2, y + 39.5);
    });
    this.y += 51;
  }
  legend(items) {
    const d = this.doc; this.need(8); let x = this.M;
    items.forEach(([label, rgb]) => {
      d.setFillColor(...rgb); d.circle(x + 1, this.y - 1, 1, "F"); d.setFont("helvetica", "normal"); d.setFontSize(7.5); d.setTextColor(...COL.text);
      d.text(clean(label), x + 3.5, this.y); x += 3.5 + d.getTextWidth(clean(label)) + 6;
    });
    this.y += 5;
  }
  // Reserves a whole page for the contents: heading now, list drawn later by fillIndex(). The next section starts on a fresh page.
  // same = true keeps the list on the current page (below the title block); otherwise it gets its own page.
  reserveContents(title = "Contents", note = "What is in this report and where to find it.", { same = false } = {}) {
    if (!same) this.newPage();
    this.h1(title); this.para(note, { size: 8.5, color: COL.grey }); const page = this.n;
    this._idxY = same ? this.y + 8 : null; this.y = this.BOTTOM + 1; return page;
  }
  // The contents list is drawn on its reserved page once every section has its page number.
  // Numbered 1, 2, 3 for the main sections; sub-sections are indented. The right column is the PAGE number.
  fillIndex(page, y0 = this._idxY || 44) {
    const d = this.doc, { M, W } = this; d.setPage(page);
    const rowH = Math.min(this.sections.length > 20 ? 7 : 8.5, (this.BOTTOM - y0) / Math.max(1, this.sections.length)); let y = y0, k = 0;
    d.setFont("helvetica", "bold"); d.setFontSize(7.5); d.setTextColor(...COL.grey); d.text("SECTION", M, y - 6); d.text("PAGE", W - M, y - 6, { align: "right" });
    this.sections.forEach((s) => {
      const sub = s.level > 1; if (!sub) k += 1;
      d.setFont("helvetica", "bold"); d.setFontSize(9); d.setTextColor(...COL.blue); if (!sub) d.text(String(k), M, y);
      d.setFont("helvetica", sub ? "normal" : "normal"); d.setFontSize(sub ? 9 : 10); d.setTextColor(...(sub ? COL.text : COL.ink)); d.text(clean(s.title), M + (sub ? 14 : 8), y);
      d.setFont("helvetica", "bold"); d.setFontSize(10); d.setTextColor(...COL.ink); d.text(String(s.page), W - M, y, { align: "right" });
      d.setDrawColor(225, 229, 235); d.line(M, y + 2.2, W - M, y + 2.2); y += rowH;
    });
  }

  // ---------- chart primitives (vector, drawn with jsPDF lines and rects; every point comes from the data passed in) ----------
  _frame(x, y, w, h, { x0 = 0, x1 = 1, y0 = 0, y1 = 1, xLabel, yLabel, fx = (v) => v.toFixed(1), fy = (v) => v.toFixed(1) }) {
    const d = this.doc, L = 11, B = 8;
    const px = x + L, py = y, pw = w - L - 2, ph = h - B;
    d.setDrawColor(225, 229, 235); d.setLineWidth(0.15); d.setFont("helvetica", "normal"); d.setFontSize(6.5); d.setTextColor(...COL.grey);
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4, gy = py + ph - ph * t, gx = px + pw * t;
      d.line(px, gy, px + pw, gy); d.line(gx, py, gx, py + ph);
      d.text(fy(y0 + (y1 - y0) * t), px - 1.2, gy + 1, { align: "right" }); d.text(fx(x0 + (x1 - x0) * t), gx, py + ph + 3.2, { align: "center" });
    }
    d.setDrawColor(...COL.grey); d.setLineWidth(0.3); d.line(px, py, px, py + ph); d.line(px, py + ph, px + pw, py + ph);
    d.setFontSize(7); d.setTextColor(...COL.text);
    if (xLabel) d.text(clean(xLabel), px + pw / 2, py + ph + 7, { align: "center" });
    if (yLabel) d.text(clean(yLabel), x + 2, py + ph / 2, { angle: 90, align: "center" });
    return { px, py, pw, ph, X: (v) => px + pw * ((v - x0) / (x1 - x0 || 1)), Y: (v) => py + ph - ph * ((v - y0) / (y1 - y0 || 1)) };
  }
  _legend(items, x, y) {
    const d = this.doc; let cx = x; d.setFont("helvetica", "normal"); d.setFontSize(7);
    items.forEach((it) => { d.setFillColor(...it.color); d.rect(cx, y - 2, 4, 2, "F"); d.setTextColor(...COL.text); d.text(clean(it.name), cx + 5.5, y - 0.2); cx += 8 + d.getTextWidth(clean(it.name)) + 4; });
  }
  // series: [{name,color:[r,g,b],xs,ys,dash}], marks: [{x,y,color}]
  lineChart({ title, series, marks = [], xLabel, yLabel, diag = false, xMax = 1, yMax = 1, h = 62, w = this.CW, note, fx, fy }) {
    this.need(h + 12 + (note ? 6 : 0)); const d = this.doc;
    if (title) { d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text(clean(title), this.M, this.y); this.y += 3; }
    const f = this._frame(this.M, this.y + 1, w, h, { x1: xMax, y1: yMax, xLabel, yLabel, fx, fy });
    if (diag) { d.setDrawColor(...COL.grey); d.setLineDashPattern([1.2, 1.2], 0); d.line(f.X(0), f.Y(0), f.X(Math.min(xMax, yMax)), f.Y(Math.min(xMax, yMax))); d.setLineDashPattern([], 0); }
    series.forEach((s) => {
      d.setDrawColor(...s.color); d.setLineWidth(0.5); if (s.dash) d.setLineDashPattern([1.5, 1.5], 0);
      for (let i = 1; i < s.xs.length; i += 1) d.line(f.X(s.xs[i - 1]), f.Y(s.ys[i - 1]), f.X(s.xs[i]), f.Y(s.ys[i]));
      if (s.dots) s.xs.forEach((xv, i) => { d.setFillColor(...s.color); d.circle(f.X(xv), f.Y(s.ys[i]), 0.9, "F"); });
      d.setLineDashPattern([], 0);
    });
    marks.forEach((m) => { d.setFillColor(...m.color); d.setDrawColor(255, 255, 255); d.setLineWidth(0.3); d.circle(f.X(m.x), f.Y(m.y), 1.5, "FD"); });
    d.setLineWidth(0.2); this.y += h + 4; this._legend(series.map((s) => ({ name: s.name, color: s.color })).concat(marks.length ? [{ name: "chosen cut-off", color: marks[0].color }] : []), this.M + 11, this.y + 2); this.y += 5;
    if (note) this.para(note, { size: 7.5, color: COL.grey, italic: true });
    else this.y += 2;
  }
  // grouped bars. cats: [], series: [{name,color,values}]
  barChart({ title, cats, series, yMax, yLabel, h = 62, ref, note, fy = (v) => v.toFixed(2) }) {
    this.need(h + 18 + (note ? 6 : 0)); const d = this.doc;
    if (title) { d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text(clean(title), this.M, this.y); this.y += 3; }
    const top = yMax || Math.max(...series.flatMap((s) => s.values)) * 1.1;
    const f = this._frame(this.M, this.y + 1, this.CW, h - 6, { x0: 0, x1: 1, y1: top, yLabel, fx: () => "", fy });
    const gw = f.pw / cats.length, bw = Math.min(6, (gw * 0.8) / series.length);
    cats.forEach((c, i) => {
      series.forEach((s, k) => { const v = s.values[i] ?? 0, bh = f.ph * (v / top); d.setFillColor(...s.color); d.rect(f.px + gw * i + gw / 2 - (bw * series.length) / 2 + bw * k, f.py + f.ph - bh, bw - 0.4, bh, "F"); });
      d.setFont("helvetica", "normal"); d.setFontSize(6); d.setTextColor(...COL.text);
      const lab = clean(c).length > 11 ? clean(c).slice(0, 10) + "." : clean(c); d.text(lab, f.px + gw * i + gw / 2, f.py + f.ph + 3.4, { angle: 0, align: "center" });
    });
    if (ref != null) { d.setDrawColor(...COL.red); d.setLineDashPattern([1.2, 1.2], 0); d.line(f.px, f.Y(ref.value), f.px + f.pw, f.Y(ref.value)); d.setLineDashPattern([], 0); d.setFontSize(6.5); d.setTextColor(...COL.red); d.text(clean(ref.label), f.px + f.pw, f.Y(ref.value) - 1, { align: "right" }); }
    this.y += h - 1; this._legend(series.map((s) => ({ name: s.name, color: s.color })), this.M + 11, this.y + 1); this.y += 5;
    if (note) this.para(note, { size: 7.5, color: COL.grey, italic: true }); else this.y += 2;
  }
  // histogram of two groups on a log count axis
  hist({ title, edges, a, b, aName, bName, aColor, bColor, xLabel = "Model score", h = 56 }) {
    this.need(h + 14); const d = this.doc;
    if (title) { d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text(clean(title), this.M, this.y); this.y += 3; }
    const lg = (v) => Math.log10(v + 1), top = Math.max(lg(Math.max(...a, ...b)), 1);
    const f = this._frame(this.M, this.y + 1, this.CW, h, { y1: top, xLabel, yLabel: "log10 (count + 1)", fy: (v) => v.toFixed(1) });
    const n = a.length, bw = f.pw / n;
    [[b, bColor], [a, aColor]].forEach(([arr, col]) => arr.forEach((v, i) => { const bh = f.ph * (lg(v) / top); d.setFillColor(...col); d.rect(f.px + i * bw + 0.15, f.py + f.ph - bh, bw - 0.3, bh, "F"); }));
    this.y += h + 4; this._legend([{ name: aName, color: aColor }, { name: bName, color: bColor }], this.M + 11, this.y + 1); this.y += 6;
  }
  // 2x2 confusion tiles. items: [{title, cm:{tp,fp,fn,tn}}] drawn side by side
  confusion(items) {
    const d = this.doc, gap = 6, w = (this.CW - gap * (items.length - 1)) / items.length, h = 40;
    this.need(h + 10);
    items.forEach((it, k) => {
      const x = this.M + k * (w + gap), y = this.y, cw = (w - 22) / 2, ch = (h - 16) / 2, { tp, fp, fn, tn } = it.cm, tot = tp + fp + fn + tn;
      d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text(clean(it.title), x, y + 3);
      d.setFont("helvetica", "normal"); d.setFontSize(6.5); d.setTextColor(...COL.grey);
      d.text("Flagged", x + 20 + cw / 2, y + 8, { align: "center" }); d.text("Not flagged", x + 20 + cw * 1.5, y + 8, { align: "center" });
      d.text("Fraud", x + 18, y + 10 + ch / 2 + 1, { align: "right" }); d.text("Normal", x + 18, y + 10 + ch * 1.5 + 1, { align: "right" });
      [[tp, 0, 0, COL.green, "caught"], [fn, 1, 0, COL.red, "missed"], [fp, 0, 1, COL.amber, "false alarm"], [tn, 1, 1, COL.teal, "correct pass"]].forEach(([v, cx, cy, col, nm]) => {
        d.setFillColor(...col.map((c) => Math.round(255 - (255 - c) * 0.22))); d.setDrawColor(...col); d.setLineWidth(0.3); d.rect(x + 20 + cx * cw, y + 10 + cy * ch, cw - 1, ch - 1, "FD");
        d.setFont("helvetica", "bold"); d.setFontSize(10); d.setTextColor(...COL.ink); d.text(Number(v).toLocaleString("en-US"), x + 20 + cx * cw + (cw - 1) / 2, y + 10 + cy * ch + ch / 2 - 0.5, { align: "center" });
        d.setFont("helvetica", "normal"); d.setFontSize(6.3); d.setTextColor(...COL.grey); d.text(`${nm}  ${((v / tot) * 100).toFixed(2)}%`, x + 20 + cx * cw + (cw - 1) / 2, y + 10 + cy * ch + ch / 2 + 3.6, { align: "center" });
      });
    });
    d.setLineWidth(0.2); this.y += h + 4;
  }
  // horizontal bars. rows: [{label, value}]
  hbars({ title, rows, fmt = (v) => v.toFixed(3), color = COL.teal, labelW = 52 }) {
    const d = this.doc, rh = 5.2, mx = Math.max(...rows.map((r) => r.value), 1e-9);
    this.need(Math.min(rows.length, 6) * rh + 8);
    if (title) { d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text(clean(title), this.M, this.y); this.y += 4; }
    rows.forEach((r) => {
      this.need(rh + 1); const bw = (this.CW - labelW - 22) * (r.value / mx);
      d.setFont("helvetica", "normal"); d.setFontSize(7.3); d.setTextColor(...COL.text); d.text(clean(r.label).slice(0, 44), this.M, this.y + 3);
      d.setFillColor(...color); d.rect(this.M + labelW, this.y + 0.6, Math.max(bw, 0.4), rh - 1.8, "F"); d.text(fmt(r.value), this.M + labelW + bw + 1.5, this.y + 3);
      this.y += rh;
    });
    this.y += 2;
  }
  // correlation heatmap
  heatmap({ title, labels, matrix, note }) {
    const d = this.doc, n = labels.length, lw = 26, cell = Math.min(8.5, (this.CW - lw - 4) / n), H = lw + n * cell + 6;
    this.need(H + 6); if (title) { d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.setTextColor(...COL.ink); d.text(clean(title), this.M, this.y); this.y += 3; }
    const x0 = this.M + lw, y0 = this.y + lw;
    labels.forEach((l, i) => {
      const t = clean(l).length > 14 ? clean(l).slice(0, 13) + "." : clean(l); d.setFont("helvetica", "normal"); d.setFontSize(6); d.setTextColor(...COL.text);
      d.text(t, x0 - 1.2, y0 + i * cell + cell / 2 + 0.8, { align: "right" }); d.text(t, x0 + i * cell + cell / 2 + 0.8, y0 - 1.2, { angle: 60 });
    });
    matrix.forEach((row, i) => row.forEach((v, j) => {
      if (v == null) d.setFillColor(240, 242, 245); else { const a = Math.min(1, Math.abs(v)) * 0.9 + 0.06, base = v >= 0 ? [20, 150, 130] : [220, 80, 80]; d.setFillColor(...base.map((c) => Math.round(255 - (255 - c) * a))); }
      d.rect(x0 + j * cell, y0 + i * cell, cell - 0.2, cell - 0.2, "F");
      if (cell >= 6 && v != null) { d.setFontSize(5); d.setTextColor(30, 30, 30); d.text(v.toFixed(2).replace("0.", ".").replace("-.", "-."), x0 + j * cell + cell / 2, y0 + i * cell + cell / 2 + 0.7, { align: "center" }); }
    }));
    this.y = y0 + n * cell + 3; if (note) this.para(note, { size: 7.5, color: COL.grey, italic: true });
  }
  // page numbers on every page and the disclaimer on the last page
  finish() {
    const d = this.doc, { M, W } = this, total = this.n;
    d.setPage(total);
    const ICON = 5, footY = 285, top = footY - ICON + 1.2, ghX = W - M - ICON, liX = ghX - 2.5 - ICON;
    const li = icon("linkedin"), gh = icon("github");
    d.setFont("helvetica", "bold"); d.setFontSize(8); d.setTextColor(90, 90, 90);
    d.text(`Developed by ${DEV_NAME}`, liX - 2.5, footY, { align: "right" });
    if (li) { d.addImage(li, "PNG", liX, top, ICON, ICON); if (DEVELOPER_LINKEDIN_URL) d.link(liX, top, ICON, ICON, { url: DEVELOPER_LINKEDIN_URL }); }
    if (gh) { d.addImage(gh, "PNG", ghX, top, ICON, ICON); if (DEVELOPER_GITHUB_URL) d.link(ghX, top, ICON, ICON, { url: DEVELOPER_GITHUB_URL }); }
    d.setDrawColor(200, 200, 200); d.line(M, 266, W - M, 266);
    d.setFont("helvetica", "italic"); d.setFontSize(8); d.setTextColor(130, 130, 130); d.text(this.disclaimer || DISCLAIMER_LINE, M, 273, { maxWidth: this.CW });
    d.setFont("helvetica", "normal"); d.setFontSize(7.5); d.setTextColor(110, 110, 110); d.text(this.versionLine || "ApexFi V2. Figures are read from the saved result files.", M, 280, { maxWidth: this.CW });
    for (let i = 1; i <= total; i += 1) {
      d.setPage(i); d.setFont("helvetica", "normal"); d.setFontSize(8); d.setTextColor(140, 140, 140);
      d.text(`${String(i).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W / 2, 291, { align: "center" });
    }
  }
}
