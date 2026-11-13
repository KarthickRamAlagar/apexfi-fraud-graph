"""Small, safe edits to existing ApexFi pages. Run from the repo root:  python tools/patch_frontend.py
Each edit looks for an exact piece of text. If it is already changed, it says 'already done'. If the text is not found,
it says 'NOT FOUND' and changes nothing in that file. Line endings (CRLF or LF) are kept as they were."""
import os, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.getcwd()
FE = os.path.join(ROOT, "frontend", "src", "pages")

EDITS = {
 "EDA.jsx": [
  ("import { useEffect, useRef, useState } from 'react'\n", "import { useEffect, useRef, useState } from 'react'\nimport { useNavigate } from 'react-router-dom'\n", "import useNavigate"),
  ("  const audioRef = useRef(null)\n", "  const audioRef = useRef(null)\n  const navigate = useNavigate()\n", "navigate hook"),
  ("    const streamlitUrl = import.meta.env.VITE_STREAMLIT_URL || 'http://localhost:8501'\n    window.open(streamlitUrl, '_blank', 'noopener,noreferrer')\n", "    navigate('/profiling')\n", "open Full Profiling page"),
  ("Full statistical profiling (pandas-profiling style) runs in the standalone Streamlit app.", "Every column, its missing values and the raw rows are on the Full Profiling and Raw Data Browser pages.", "footer text"),
  ("          Explore More EDA\n", "          Open Full Profiling\n", "button label"),
 ],
 "About.jsx": [
  ("'React + Streamlit'", "'React app'", "pipeline diagram"),
  ("The web app and the Streamlit app read only saved results", "The web app reads only saved results", "line 98"),
  ("Public deployment (frontend and Streamlit) on a trimmed dataset.", "Public deployment (frontend and API) on a trimmed dataset.", "roadmap"),
 ],
 "../components/TourGuide.jsx": [
  ("from More → Application Tour.", "from the Application Tour link at the bottom of the sidebar.", "tour hint text"),
 ],
 "V2Evaluation.jsx": [
  ("import { api } from '@/lib/api'\n", "import { api } from '@/lib/api'\nimport { Download } from 'lucide-react'\nimport { downloadV2Report } from '@/lib/pdf/v2Report'\n", "imports"),
  ("      <h1 className=\"text-2xl font-semibold font-display\">V2 Evaluation</h1>\n",
   "      <div className=\"flex items-start justify-between gap-4\">\n      <h1 className=\"text-2xl font-semibold font-display\">V2 Evaluation</h1>\n      <button type=\"button\" disabled={!q.data} onClick={() => downloadV2Report(q.data)} className=\"flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary disabled:opacity-40\"><Download size={13} /> Download PDF</button>\n      </div>\n", "download button"),
 ],
 "ScoreNewTransaction.jsx": [
  ("import { api } from '@/lib/api'\n", "import { api } from '@/lib/api'\nimport { Download } from 'lucide-react'\nimport { downloadScoreReport } from '@/lib/pdf/scoreReports'\n", "imports"),
  ("                <button\n                  onClick={handleScoreAnother}",
   "                <button\n                  onClick={() => downloadScoreReport('transaction', result, Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')))}\n                  className=\"flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110\"\n                >\n                  <Download size={15} /> Download PDF report\n                </button>\n                <button\n                  onClick={handleScoreAnother}", "download button"),
 ],
 "ScoreUnlabeledAccount.jsx": [
  ("\nimport { HelpCircle, ShieldAlert, ShieldCheck } from 'lucide-react'\n", "\nimport { HelpCircle, ShieldAlert, ShieldCheck, Download } from 'lucide-react'\nimport { downloadScoreReport } from '@/lib/pdf/scoreReports'\n", "imports"),
  ("              <button\n                onClick={handleScoreAnother}\n                className=\"mt-4",
   "              <button\n                onClick={() => downloadScoreReport('account', result)}\n                className=\"mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110\"\n              >\n                <Download size={15} /> Download PDF report\n              </button>\n              <button\n                onClick={handleScoreAnother}\n                className=\"mt-4", "download button"),
 ],
}

bad = 0
for name, edits in EDITS.items():
    path = os.path.join(FE, name)
    if not os.path.exists(path):
        print(f"{name}: file not found"); bad += 1; continue
    raw = open(path, "rb").read().decode("utf-8")
    crlf = "\r\n" in raw
    text = raw.replace("\r\n", "\n")
    changed = False
    for old, new, what in edits:
        if new in text:
            print(f"{name}: {what}: already done"); continue
        if text.count(old) != 1:
            print(f"{name}: {what}: NOT FOUND (text differs from the expected one) - left alone"); bad += 1; continue
        text = text.replace(old, new); changed = True
        print(f"{name}: {what}: done")
    if changed:
        out = text.replace("\n", "\r\n") if crlf else text
        open(path, "wb").write(out.encode("utf-8"))
print("\nAll edits applied." if not bad else f"\n{bad} edit(s) need a look. Send me the lines above.")
