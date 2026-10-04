import { Link, useSearchParams } from 'react-router-dom'
import { Info, AlertTriangle, ShieldCheck, Database, Workflow, Cpu, GitCompare, BarChart3, Users, Globe2, Hourglass, ArrowRight, Compass, LayoutGrid, Settings2, LineChart as LineIcon, Lock } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { cn } from '@/lib/utils'

// ---- Fill these in once; they appear in the "Team & guidance" section. Empty values are hidden. ----
const TEAM = {
  student: '',      // e.g. 'Your Name'
  programme: 'M.Tech',
  institution: 'Amrita School of Computing, Bengaluru',
  guide: '',        // e.g. 'Dr. Guide Name'
  guideRole: '',    // e.g. 'Project Guide'
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'how', label: 'How it works', icon: Settings2 },
  { key: 'results', label: 'Results & limits', icon: LineIcon },
  { key: 'security', label: 'Security & roadmap', icon: Lock },
  { key: 'team', label: 'Team & SDG', icon: Users },
]

export default function About() {
  const [params, setParams] = useSearchParams()
  const active = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview'
  const go = (key) => setParams({ tab: key }, { replace: true })

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-8">
      <div className="flex items-center gap-2 mb-1 text-xs tracking-wider uppercase text-muted-foreground">
        <Info size={12} /> ApexFi / About
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold font-display">About ApexFi</h1>
        <button
          onClick={() => window.dispatchEvent(new Event('apexfi:start-tour'))}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Compass size={13} /> Take the application tour
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        ApexFi is a research prototype for spotting fraud in digital payments and explaining every decision. It combines tabular
        models, a transaction graph and SHAP explanations, and it is evaluated honestly: the same problem is measured with a
        random split and with a time-aware (chronological) split, and both results are shown.
      </p>

      <div className="flex gap-1 p-1 mt-6 overflow-x-auto border rounded-xl border-border bg-secondary/30" role="tablist" aria-label="About sections">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            onClick={() => go(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              active === key ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {active === 'overview' && (
          <>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Section title="The problem" icon={AlertTriangle}>
                  <p>Digital payments such as UPI and IMPS move money in seconds, so fraud has to be caught in seconds too. Three things make it hard:</p>
                  <ul>
                    <li><b>Fraud is rare.</b> In the main dataset only 3.5% of transactions are fraud, so accuracy alone is misleading.</li>
                    <li><b>Fraud is connected.</b> Fraudsters reuse devices, cards and accounts, so a single transaction looks normal while the network around it does not.</li>
                    <li><b>Decisions need reasons.</b> A bank cannot act on "the model said so"; every flag must come with an explanation.</li>
                  </ul>
                  <p>A fourth problem is quieter: models tested on a <i>random</i> split often look better than they will in real life, because they can learn from the future. ApexFi measures that gap directly.</p>
                </Section>
                <Section title="The data" icon={Database}>
                  <Grid3>
                    <Fact t="IEEE-CIS Fraud Detection" v="590,540 transactions" s="3.499% fraud · amounts in USD · card transactions" />
                    <Fact t="DGraph-Fin" v="3,700,550 accounts" s="a large social-financial graph with labelled and unlabelled accounts" />
                    <Fact t="Ethereum (experiment)" v="blockchain accounts" s="earlier experiment kept as a side study" />
                  </Grid3>
                  <p className="mt-3">These are public benchmark datasets, not real UPI records. They stand in for UPI/IMPS-style data because real payment data is not public. See the <Link to="/datasets" className="text-primary hover:underline">Datasets</Link> page.</p>
                </Section>
            </div>
          </>
        )}

        {active === 'how' && (
          <>
            <Section title="The pipeline" icon={Workflow}>
              <Flow steps={['Raw files', 'Bronze (as loaded)', 'Silver (cleaned)', 'Gold (features + graph edges)', 'Models', 'FastAPI', 'React + Streamlit']} />
              <ul className="mt-3">
                <li>Everything is stored in PostgreSQL in three layers (Bronze → Silver → Gold).</li>
                <li>Gold holds the model-ready features and the graph links (for example, transactions sharing a device or a card).</li>
                <li>The backend pre-loads all models when it starts, and a database index fix cut live scoring from <b>6,374 ms to 138 ms</b> on average.</li>
                <li>The web app and the Streamlit app read only saved results and live predictions; they never train anything.</li>
              </ul>
            </Section>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Section title="The models" icon={Cpu}>
                  <Grid3>
                    <Fact t="Stacked model (flagship)" v="LightGBM + GraphSAGE" s="Two models, combined by a logistic stacker. The GNN uses the transaction graph; LightGBM uses 446 tabular features." />
                    <Fact t="Time-series model" v="LightGBM, 7 features" s="Frequency features plus rolling 1-hour history per card and device, trained on the earlier 75% of time." />
                    <Fact t="Explanations" v="SHAP" s="Signed reasons for each score: red raises risk, green lowers it." />
                  </Grid3>
                  <p className="mt-3">Compare them on the same transaction in <Link to="/model-comparison" className="text-primary hover:underline">Model Comparison</Link>, or on <Link to="/investigate" className="text-primary hover:underline">Investigate</Link> and <Link to="/score-new" className="text-primary hover:underline">Score New</Link>, where a PDF report can be downloaded.</p>
                </Section>
                <Section title="Two validation modes" icon={GitCompare}>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Box t="Random split" tone="medium">Transactions are shuffled, then split. Easy and common, but a card seen in training can reappear in testing, so scores look better than real life. Used for the flagship numbers.</Box>
                    <Box t="Chronological split" tone="low">Train on the earlier 75% of time, test on the later 25%. This is how a bank really uses a model: yesterday predicts tomorrow. Used for the time-series model.</Box>
                  </div>
                  <p className="mt-3">Like-for-like on the same 4 features, ROC-AUC drops from <b>0.846</b> (random) to <b>0.769</b> (chronological). Adding rolling-window features recovers part of it, to <b>0.790</b>. That gap is the honest cost of the random split.</p>
                </Section>
            </div>
          </>
        )}

        {active === 'results' && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Section title="Measured results" icon={BarChart3}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-muted-foreground"><th className="py-1.5 font-normal">Model / setting</th><th className="font-normal">Split</th><th className="font-normal">F1</th><th className="font-normal">ROC-AUC</th></tr></thead>
                    <tbody className="font-mono">
                      <Row a="Stacked LightGBM + GraphSAGE (IEEE-CIS)" b="Random, 3-seed" c="0.798" d="0.974" />
                      <Row a="Stacked model (DGraph-Fin)" b="Random" c="0.687" d="0.938" />
                      <Row a="LightGBM, 4 features" b="Random" c="0.218" d="0.846" />
                      <Row a="Time-series LightGBM (rolling features)" b="Chronological" c="0.234 @ 0.6" d="0.790" />
                    </tbody>
                  </table>
                </div>
                <p className="mt-3">The two groups of numbers are <b>not comparable</b>: different models, features and splits. The chronological test set has 147,635 transactions with 5,100 frauds. At the recommended threshold of 0.6 the time-series model catches about 50% of fraud with a 10% false-alarm rate. Full detail is in the <Link to="/temporal-full-report" className="text-primary hover:underline">Full Temporal Report</Link>.</p>
              </Section>
              <Section title="Limitations" icon={Info}>
                <ul>
                  <li>Public benchmark data, not real UPI transactions; amounts are in USD.</li>
                  <li>Not validated for real payment decisions; a flag needs human review.</li>
                  <li>Many IEEE-CIS features are anonymised, so explanations name columns, not business ideas.</li>
                  <li>The stacked and time-series models differ in features and split, so their scores are not interchangeable.</li>
                  <li>The fraud rate here (3.5%) is far higher than in real payment streams, so precision would be lower in deployment.</li>
                  <li>The SDG numbers are scenarios built from measured rates, not measured real-world outcomes.</li>
                </ul>
              </Section>
          </div>
        )}

        {active === 'security' && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Section title="Security measures implemented" icon={ShieldCheck}>
                <ul>
                  <li><b>Restricted CORS:</b> only listed origins can call the API; a wildcard is refused.</li>
                  <li><b>Security headers</b> on every response (no sniffing, no framing, no referrer, strict content policy).</li>
                  <li><b>Rate limiting</b> per client and route group; the Ask and PDF routes are the strictest.</li>
                  <li><b>Request size cap</b> of 1 MB.</li>
                  <li><b>Input validation</b> on all request bodies, search boxes and limits.</li>
                  <li><b>Safe errors:</b> users see a generic message plus a request ID; details stay in the server log.</li>
                  <li><b>Ask-your-data guard:</b> generated SQL must be a single SELECT, runs on a read-only database role with a timeout and a row cap.</li>
                  <li><b>Parameterised SQL</b> everywhere, so user text is never pasted into a query.</li>
                  <li><b>Production mode</b> hides the API docs and refuses the default database password.</li>
                </ul>
                <p className="mt-2 text-xs">These are basic hardening steps for a prototype, covered by automated tests. No formal compliance (PCI-DSS, RBI) is claimed.</p>
              </Section>
              <Section title="Planned, not built yet" icon={Hourglass}>
                <ul>
                  <li>User login and role-based access.</li>
                  <li>Shared (Redis) rate limiting and TLS for a multi-server deployment.</li>
                  <li>Independent out-of-time validation on external data.</li>
                  <li>AI assistant overlay and a full-metrics Streamlit page.</li>
                  <li>Public deployment (frontend and Streamlit).</li>
                </ul>
              </Section>
          </div>
        )}

        {active === 'team' && (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Section title="Team & guidance" icon={Users}>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TEAM.student && <Item k="Student" v={TEAM.student} />}
                  {TEAM.programme && <Item k="Programme" v={TEAM.programme} />}
                  {TEAM.institution && <Item k="Institution" v={TEAM.institution} />}
                  {TEAM.guide && <Item k={TEAM.guideRole || 'Guide'} v={TEAM.guide} />}
                </dl>
              </Section>
              <Section title="Link to the Sustainable Development Goals" icon={Globe2}>
                <p>The work is aligned with SDG 16 (target 16.4, illicit financial flows), SDG 8 (target 8.10), SDG 1 (target 1.4) and SDG 9. The Economic & SDG page turns the measured catch and false-alarm rates into scenario numbers at a daily volume you choose.</p>
                <Link to="/economics" className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-primary hover:underline">
                  Open Economic & SDG Impact <ArrowRight size={14} />
                </Link>
              </Section>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, icon, children, className }) {
  return (
    <Panel title={title} icon={icon} className={className}>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_b]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_li]:mt-1 [&_ul]:mt-1">{children}</div>
    </Panel>
  )
}
const Grid3 = ({ children }) => <div className="grid grid-cols-1 gap-3 mt-1 md:grid-cols-3">{children}</div>
const Fact = ({ t, v, s }) => (
  <div className="p-3 border rounded-xl border-border/60 bg-secondary/20">
    <div className="text-xs text-muted-foreground">{t}</div>
    <div className="mt-0.5 font-display text-lg font-semibold text-foreground">{v}</div>
    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{s}</div>
  </div>
)
const Box = ({ t, tone, children }) => (
  <div className={`p-3 border rounded-xl border-border/60 border-l-4 ${tone === 'low' ? 'border-l-risk-low' : 'border-l-risk-medium'}`}>
    <div className="mb-1 font-medium text-foreground">{t}</div>
    <div className="text-xs leading-relaxed">{children}</div>
  </div>
)
const Row = ({ a, b, c, d }) => (
  <tr className="border-t border-border/50"><td className="py-1.5 font-sans text-foreground">{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>
)
const Item = ({ k, v }) => (
  <div><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium text-foreground">{v}</dd></div>
)
function Flow({ steps }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="px-2.5 py-1 text-xs border rounded-md border-border bg-secondary/40 text-foreground">{s}</span>
          {i < steps.length - 1 && <ArrowRight size={12} className="text-muted-foreground" />}
        </span>
      ))}
    </div>
  )
}
