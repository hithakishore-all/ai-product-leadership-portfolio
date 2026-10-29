import { createRoot } from "react-dom/client";
import { AS_OF, DEALS, COHORT_ROWS, VC_DIMS, PE_DIMS } from "./data.js";
import { helioMetrics, thesisFit } from "./model.js";
import { Overview, Markets, Flows, MarketMap, Thesis, Pipeline } from "./screens1.jsx";
import { Company, Underwriting, DEFAULT_UW, DEFAULT_LBO } from "./screens2.jsx";
import { Decision, SUGGESTIONS, answer } from "./screens3.jsx";
import { api } from "./api.js";
const { useState, useEffect, useRef } = React;

const ROUTES = [
  ["Discover", [["overview", "Overview"], ["markets", "Opportunity Radar"], ["flows", "Capital Flows"], ["map", "Market Map"]]],
  ["Qualify", [["thesis", "Fund Thesis"], ["pipeline", "Deal Pipeline"], ["company", "Company 360"]]],
  ["Decide", [["underwriting", "Underwriting"], ["decision", "Decision & IC Memo"]]],
];
const TOKENS = ROUTES.flatMap(([, r]) => r.map(([k]) => k));

const INITIAL = {
  mode: "vc", excludeTop: 0, seg: "po", dataRoom: false, nrrResolution: null, drawer: false, bear: false, signedOff: false, qoeReviewed: false,
  cohort: { rows: COHORT_ROWS, file: "customer_cohort_FY26.csv", uploaded: false },
  received: {}, tasks: [], deals: DEALS, uw: DEFAULT_UW, lbo: DEFAULT_LBO, vcDims: VC_DIMS, peDims: PE_DIMS,
  thesis: { sectors: ["po", "dc"], stages: ["Series A", "Series B", "Series C"], checkMin: 8, checkMax: 20, minGrowth: 80, minNrr: 110, maxConc: 25, minRunway: 12 },
  thesisVersion: 3,
};
const KEY = "conviction-ai-demo-v1";
function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s ? { ...INITIAL, ...s, drawer: false } : INITIAL; } catch { return INITIAL; } }

function App() {
  const [st, setSt] = useState(load);
  const [route, setRoute] = useState(() => { const h = (location.hash || "").slice(1); return TOKENS.includes(h) ? h : "overview"; });
  const [toastMsg, setToastMsg] = useState(null);
  const [ask, setAsk] = useState(""); const [askOpen, setAskOpen] = useState(false); const [reply, setReply] = useState(null);
  const tRef = useRef();
  const set = (patch) => setSt((s) => ({ ...s, ...patch }));
  const toast = (m) => { setToastMsg(m); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToastMsg(null), 2600); };
  const go = (r) => { setRoute(r); try { history.replaceState(null, "", "#" + r); } catch {} window.scrollTo(0, 0); };
  useEffect(() => { const h = () => { const x = location.hash.slice(1); if (TOKENS.includes(x)) setRoute(x); }; addEventListener("hashchange", h); return () => removeEventListener("hashchange", h); }, []);
  // Connection: served by the API → load deals from Postgres; opened as a file → offline fixtures.
  const [conn, setConn] = useState({ mode: api.online ? "checking" : "offline" });
  const loadDeals = () => api.deals().then((ds) => set({ deals: ds.map((d) => ({ id: d.id, company: d.company, slug: d.slug, round: d.round, seg: d.seg, stage: d.stage, owner: d.owner, flag: d.flag })) }));
  useEffect(() => {
    if (!api.online) return;
    api.health().then((h) => {
      if (h.status === "ok") { setConn({ mode: "api", companies: h.companies }); loadDeals().catch(() => {}); }
      else setConn({ mode: "offline", reason: h.error || "database unreachable" });
    }).catch((e) => setConn({ mode: "offline", reason: e.message }));
  }, []);
  const resetDemo = async () => {
    if (conn.mode === "api") { try { await api.reset(); } catch (e) { toast(`Reset failed: ${e.message}`); return; } }
    setSt(INITIAL); if (conn.mode === "api") loadDeals().catch(() => {}); go("overview"); toast(conn.mode === "api" ? "Demo reset · Postgres reseeded" : "Demo reset");
  };
  useEffect(() => { try { const { drawer, ...rest } = st; localStorage.setItem(KEY, JSON.stringify(rest)); } catch {} }, [st]);

  const m = helioMetrics(st);
  const fit = thesisFit(st.thesis, m, st);
  const props = { st, set, go, toast, fit, conn };
  const Screen = { overview: Overview, markets: Markets, flows: Flows, map: MarketMap, thesis: Thesis, pipeline: Pipeline, company: Company, underwriting: Underwriting, decision: Decision }[route];
  const exceptions = st.mode === "vc" ? (st.dataRoom && !st.nrrResolution ? 1 : 0) : st.qoeReviewed ? 0 : 1;

  const submitAsk = (q) => { const text = q || ask; if (!text.trim()) return; setReply({ q: text, ...answer(text, st) }); setAskOpen(false); };

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand"><div className="brand-mark">C</div><div><b>Conviction AI</b><span>Investment intelligence</span></div></div>
        <nav className="nav" aria-label="Main">
          {ROUTES.map(([g, items]) => (
            <React.Fragment key={g}><div className="nav-group">{g}</div>
              {items.map(([k, l]) => <a key={k} href={"#" + k} className={route === k ? "on" : ""} onClick={(e) => { e.preventDefault(); go(k); }}>{k === "company" && st.mode === "pe" ? "Target Profile" : l}{k === "company" && exceptions > 0 && <span className="pip">{exceptions}</span>}</a>)}
            </React.Fragment>))}
        </nav>
        <div className="rail-foot">
          All companies, rounds and metrics are synthetic.<br />
          <button className="linkish" style={{ color: "var(--railink)", textDecoration: "underline", marginTop: 6 }} onClick={resetDemo}>Reset demo</button>
        </div>
      </aside>
      <div className="main">
        <div className="banner"><b>SYNTHETIC DEMO</b><span>{conn.mode === "api" ? "Fictional demo companies, plus real companies researched from public sources (marked researched, every fact linked)." : "Fictional companies and figures for demonstration. No data-provider APIs are connected."}</span>
          <span className="tag" style={{ marginLeft: "auto", marginBlock: -3, background: conn.mode === "api" ? "var(--oksoft)" : "var(--panel)", color: conn.mode === "api" ? "var(--ok)" : "var(--muted)" }} title={conn.reason || ""}>
            {conn.mode === "api" ? "● Live · Postgres via API" : conn.mode === "checking" ? "Connecting…" : "○ Offline demo · bundled data"}</span></div>
        <header className="topbar">
          <select className="select" aria-label="Fund" value={st.mode === "vc" ? "f2" : "f4"} onChange={(e) => set({ mode: e.target.value === "f2" ? "vc" : "pe" })}>
            <option value="f2">Fund II · Growth</option><option value="f4">Fund IV · Buyout</option>
          </select>
          <div className="seg-ctl" role="group" aria-label="Mode">
            {[["vc", "Growth VC"], ["pe", "PE Buyout"]].map(([v, l]) => <button key={v} className={st.mode === v ? "on" : ""} onClick={() => { set({ mode: v }); toast(v === "pe" ? "PE mode: Crestline · EBITDA, leverage, cash conversion" : "Growth VC mode: HelioOps · ARR, NRR, ownership"); }}>{l}</button>)}
          </div>
          <form className="ask" onSubmit={(e) => { e.preventDefault(); submitAsk(); }}>
            <input id="ask" aria-label="Ask Conviction" placeholder="Ask Conviction about this workspace…" value={ask} onChange={(e) => setAsk(e.target.value)} onFocus={() => setAskOpen(true)} onBlur={() => setTimeout(() => setAskOpen(false), 150)} />
            {askOpen && <div className="panel" style={{ position: "absolute", top: 40, left: 0, right: 0, zIndex: 20, gap: 4, padding: 8, boxShadow: "0 12px 30px rgba(0,0,0,.18)" }}>
              {SUGGESTIONS.map((s) => <button type="button" key={s} className="btn ghost" style={{ border: 0, justifyContent: "flex-start" }} onMouseDown={() => { setAsk(s); submitAsk(s); }}>{s}</button>)}
            </div>}
          </form>
          <span className="chip-asof">As of {AS_OF}</span>
        </header>
        {reply && (
          <div style={{ paddingInline: "max(20px, env(safe-area-inset-left, 0px))", paddingTop: 14 }}>
            <div className="callout info" style={{ maxWidth: 1320 }}>
              <div className="stack" style={{ gap: 6, flex: "1 1 400px" }}>
                <span className="small muted">You asked: {reply.q} · <Tag s="inferred">Demo response</Tag> deterministic, no live model connected</span>
                <span>{reply.text}</span>
                {reply.cites.length > 0 && <span className="small muted">Grounded in: {reply.cites.join(", ")}</span>}
              </div>
              <div className="row">{reply.action && <button className="btn primary" onClick={() => { if (reply.action[2]) set(reply.action[2]); if (reply.action[0] === "Open bear case") set({ mode: "vc" }); go(reply.action[1]); setReply(null); }}>{reply.action[0]}</button>}
                <button className="btn" onClick={() => setReply(null)}>Dismiss</button></div>
            </div>
          </div>)}
        <Screen key={route + st.mode} {...props} />
      </div>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

function Tag({ s, children }) { return <span className={`tag t-${s}`}>{children}</span>; }

createRoot(document.getElementById("root")).render(<App />);
