import { HELIO, DOCS, COHORT_ROWS, CRESTLINE, BEAR_CASE } from "./data.js";
import * as E from "./engine.js";
import { claimsFor, helioMetrics, coverage } from "./model.js";
import { api } from "./api.js";
import { Tag, Num, Field, Bar, fmtM, pct, mult } from "./ui.jsx";
const { useState, useEffect } = React;

export const SAMPLE_CSV = "customer,opening_arr,ending_arr\n" + COHORT_ROWS.map((r) => `${r.customer},${r.opening},${r.ending}`).join("\n");

export function parseCohortCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The file has no data rows.");
  const head = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const ci = head.findIndex((h) => h.startsWith("customer"));
  const oi = head.findIndex((h) => h.startsWith("opening"));
  const ei = head.findIndex((h) => h.startsWith("ending"));
  if (oi < 0 || ei < 0) throw new Error("Need columns named opening_arr and ending_arr (customer is optional).");
  const rows = lines.slice(1).map((l, i) => { const c = l.split(","); return { customer: ci >= 0 ? c[ci] : `Row ${i + 2}`, opening: Number(c[oi]), ending: Number(c[ei]) }; })
    .filter((r) => Number.isFinite(r.opening) && Number.isFinite(r.ending));
  if (!rows.length) throw new Error("No numeric opening/ending values found.");
  return rows;
}

// ---------------- Company 360 ----------------
export function Company(props) {
  if (props.st.mode === "pe") return <CrestlineProfile go={props.go} st={props.st} />;
  const live = props.conn && props.conn.mode === "api";
  if (live && props.st.company && props.st.company !== "helioops") return <ResearchedCompany {...props} key={props.st.company} />;
  return <HelioCompany {...props} />;
}

// Live mode only: choose which Account Company 360 shows, or import a new company pack.
function CompanyPicker({ st, set, conn, toast }) {
  const [list, setList] = useState(null);
  const live = conn && conn.mode === "api";
  const load = () => api.companies().then(setList).catch(() => setList([]));
  useEffect(() => { if (live) load(); }, [live]);
  if (!live || !list) return null;
  const onPack = (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    api.importPack(f).then((r) => { toast(`Imported ${r.account}: ${r.claims} claims from ${r.sources} sources`); load(); set({ company: r.account }); })
      .catch((x) => toast(`Import failed: ${x.message.split("\n")[0]}`));
  };
  return (
    <>
      <select className="select" aria-label="Company" value={st.company || "helioops"} onChange={(e) => set({ company: e.target.value })}>
        {list.map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.is_synthetic ? " · synthetic" : " · researched"}</option>)}
      </select>
      <label className="btn" htmlFor="pack-in">Import pack</label>
      <input id="pack-in" type="file" accept=".json,application/json" hidden onChange={onPack} />
    </>
  );
}

function HelioCompany({ st, set, go, fit, toast, conn }) {
  const live = conn && conn.mode === "api";
  const [tab, setTab] = useState("evidence");
  const [loading, setLoading] = useState(-1);
  const [err, setErr] = useState(null);
  const claims = claimsFor(st);
  const m = helioMetrics(st);
  const cov = coverage(claims);
  const loaded = st.dataRoom;

  const loadRoom = () => {
    setLoading(0);
    let i = 0; const tick = () => { i += 1; setLoading(i); if (i < DOCS.length + 1) setTimeout(tick, 420); else finish(); };
    // Live mode: the cohort rows come from Postgres (GET /api/accounts/helioops/retention).
    const finish = () => {
      if (!live) { set({ dataRoom: true }); setLoading(-1); toast("Data room processed · 1 contradiction found"); return; }
      api.retention("helioops").then((r) => {
        set({ dataRoom: true, cohort: { rows: r.rows.map((x) => ({ customer: x.customer, opening: x.opening, ending: x.ending })), file: r.source_file, uploaded: false, live: true } });
        setLoading(-1); toast(`Loaded ${r.rows.length} cohort rows from Postgres · NRR ${(r.nrr * 100).toFixed(1)}%`);
      }).catch((e) => { setLoading(-1); setErr(`Could not load from API: ${e.message}`); });
    };
    setTimeout(tick, 420);
  };
  const onCsv = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (live) {
      api.uploadCohort("helioops", f).then((r) => {
        set({ dataRoom: true, cohort: { rows: r.rows.map((x) => ({ customer: x.customer, opening: x.opening, ending: x.ending })), file: r.source_file, uploaded: true, live: true }, nrrResolution: null });
        setErr(null); toast(`Saved ${r.rows.length} rows to Postgres · NRR ${(r.nrr * 100).toFixed(1)}%`);
      }).catch((x) => setErr(x.message));
      e.target.value = ""; return;
    }
    const rd = new FileReader();
    rd.onload = () => { try { const rows = parseCohortCsv(String(rd.result)); set({ dataRoom: true, cohort: { rows, file: f.name, uploaded: true }, nrrResolution: null }); setErr(null); toast(`Recomputed NRR from ${f.name}`); } catch (x) { setErr(x.message); } };
    rd.readAsText(f); e.target.value = "";
  };
  const statusOf = (id) => claims.find((c) => c.id === id).status;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><a href="#markets">Radar</a> / <a href="#map">Physical Operations AI</a> / <span>HelioOps</span></div>
          <h1>HelioOps <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>· {HELIO.tagline}</span></h1>
          <p>{HELIO.segmentPath.join(" → ")} · {HELIO.stage} · {HELIO.hq} · {HELIO.employees} employees · fictional company</p>
        </div>
        <div className="row"><CompanyPicker st={st} set={set} conn={conn} toast={toast} /><button className="btn" onClick={() => go("underwriting")}>Underwrite</button><button className="btn primary" onClick={() => go("decision")}>Decision &amp; memo →</button></div>
      </div>

      {!loaded && (
        <div className="panel">
          <div className="panel-head"><h2>Company data room</h2><span className="small muted">Nothing is assumed before evidence arrives</span></div>
          {loading < 0 ? (
            <div className="row">
              <button className="btn primary" onClick={loadRoom}>Load synthetic HelioOps data room</button>
              <label className="btn" htmlFor="csv1">Upload your own cohort CSV</label>
              <input id="csv1" type="file" accept=".csv,text/csv" hidden onChange={onCsv} />
              <span className="small muted">Deck, cohort export, ARR ledger and P&amp;L · all synthetic</span>
            </div>
          ) : (
            <div className="steps">{DOCS.map((d, i) => (
              <div key={d.id} className="step"><span className={"dot " + (loading > i + 1 ? "done" : loading === i + 1 ? "on" : "")} />{d.name}<span className="small muted">{loading > i + 1 ? `· ${d.detail}` : loading === i + 1 ? "· parsing and extracting claims…" : ""}</span></div>))}
              <div className="step"><span className={"dot " + (loading > DOCS.length ? "on" : "")} />Reconciling claims with calculator functions</div>
            </div>
          )}
          {err && <p style={{ color: "var(--risk)" }}>{err}</p>}
        </div>
      )}

      {loaded && m.gap != null && Math.abs(m.gap) >= 0.5 && !st.nrrResolution && (
        <div className="callout risk">
          <div className="stack" style={{ gap: 6, flex: "1 1 320px" }}>
            <span className="eyebrow" style={{ color: "var(--risk)" }}>Unreconciled metric · high materiality</span>
            <div className="big-compare">
              <span><span className="small muted">Claimed NRR </span><span className="num">124%</span></span>
              <span><span className="small muted">Recomputed </span><span className="num">{pct(m.nrr, 1)}</span></span>
              <span><span className="small muted">Gap </span><span className="num" style={{ color: "var(--risk)" }}>{m.gap > 0 ? "+" : ""}{m.gap.toFixed(1)} pp</span></span>
            </div>
            <span className="small">Deck slide 12 vs {st.cohort.file}. Both values are kept; neither overwrites the other until a reviewer resolves it.</span>
          </div>
          <button className="btn primary" onClick={() => set({ drawer: true })}>Inspect evidence chain →</button>
        </div>
      )}
      {loaded && st.nrrResolution && (
        <div className="callout ok"><span>NRR discrepancy resolved by reviewer: <b>{st.nrrResolution}</b>. Recomputed {pct(m.nrr, 1)} is now the authoritative value.</span>
          <button className="btn sm" onClick={() => set({ nrrResolution: null })}>Reopen</button></div>
      )}

      <div className="grid g4">
        <div className="panel"><Num label="ARR · Sep 2026" value={loaded ? fmtM(HELIO.arrNow) : "—"} status={statusOf("cl-arr")} sub={loaded ? `${pct(m.growth)} YoY` : null} src={loaded ? "ARR ledger" : null} /></div>
        <div className="panel"><Num label="Net revenue retention" value={loaded ? pct(m.nrr, 0) : "—"} status={loaded ? "calculated" : "missing"} sub={loaded ? (st.nrrResolution ? `GRR ${pct(m.grr)}` : `124% claimed · disputed`) : null} src={loaded ? `Recomputed · ${st.cohort.live ? "rows from Postgres" : st.cohort.uploaded ? "uploaded CSV" : "cohort CSV"}` : null} /></div>
        <div className="panel"><Num label="Cash runway" value={loaded ? `${m.runway.toFixed(0)} mo` : "—"} status={statusOf("cl-cash")} sub={loaded ? "$4.9M / $0.35M" : null} src={loaded ? "Mgmt P&L, unaudited" : null} /></div>
        <div className="panel"><Num label="Largest customer" value={loaded ? "21.5%" : "—"} status={statusOf("cl-conc")} sub={loaded ? "Top 3 = 39% of ARR" : null} src={loaded ? "ARR ledger" : null} /></div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="tabs" role="tablist">{[["evidence", "Evidence board"], ["diligence", "Founders · PMF · moat"], ["fit", "Fund fit"], ["cohort", "Cohort data"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
          <span className="small muted">Evidence coverage <b className="num" style={{ color: "var(--ink)" }}>{pct(cov.pct)}</b> ({cov.ok}/{cov.total} critical)</span>
        </div>
        {tab === "evidence" && (
          <div className="table-wrap"><table>
            <thead><tr><th>Claim</th><th>Value</th><th>Status</th><th>Source &amp; locator</th></tr></thead>
            <tbody>{claims.map((c) => (
              <tr key={c.id} className={c.id.startsWith("cl-nrr") && loaded ? "click" : ""} onClick={() => c.id.startsWith("cl-nrr") && loaded && set({ drawer: true })}>
                <td>{c.prop}{c.critical && <span className="muted small"> · critical</span>}</td><td className="num">{c.value}</td><td><Tag s={c.status} /></td><td className="small muted">{c.source}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {tab === "diligence" && (
          <div className="grid g3">
            <div className="stack"><span className="eyebrow">Founder–domain fit</span>
              {HELIO.founders.map((f) => <div key={f.name} className="card"><b>{f.name} · {f.role}</b><span className="small">{f.evidence}</span><Tag s={f.status} /></div>)}
              <span className="small muted">Scored on domain insight and execution evidence only. No inference from age, gender, nationality or other protected traits.</span></div>
            <div className="stack"><span className="eyebrow">Product-market fit signals</span>
              {[["Paid customers (opening cohort)", loaded ? `${st.cohort.rows.length}` : "—", "calculated"], ["Net expansion from cohort", loaded ? fmtM(m.bridge.expansion / 1000, 2) : "—", "calculated"], ["Logo churn", loaded ? `${st.cohort.rows.filter((r) => r.opening > 0 && r.ending === 0).length} customers` : "—", "calculated"], ["Sales cycle", "—", "missing"], ["Reference calls", "—", "missing"]].map(([l, v, s]) => (
                <div key={l} className="row between small" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}><span>{l}</span><span className="row"><span className="num">{v}</span><Tag s={loaded || s === "missing" ? s : "missing"} /></span></div>))}</div>
            <div className="stack"><span className="eyebrow">Moat claims and alternative explanations</span>
              <div className="card"><b>"Execution data compounds"</b><span className="small">Alternative: expansion reflects one customer's rollout (C01 drives ~68% of expansion), not a data network effect.</span><Tag s="inferred" /></div>
              <div className="card"><b>Workflow embedding</b><span className="small">Alternative: switching costs are low until dispatch and parts systems are integrated.</span><Tag s="missing" /></div></div>
          </div>
        )}
        {tab === "fit" && (
          <div className="stack">{fit.map((f) => <div key={f.id} className="row between small" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}><span><b>{f.label}</b> <span className="muted">· {f.detail}</span></span><Tag s={{ pass: "calculated", warn: "assumption", fail: "disputed", unknown: "missing" }[f.status]}>{{ pass: "Fits", warn: "Check", fail: "Fails", unknown: "Unknown" }[f.status]}</Tag></div>)}
            <button className="linkish" style={{ alignSelf: "flex-start" }} onClick={() => go("thesis")}>Edit Fund II thesis →</button></div>
        )}
        {tab === "cohort" && <CohortTab st={st} set={set} onCsv={onCsv} err={err} toast={toast} />}
      </div>
      {st.drawer && <Discrepancy st={st} set={set} m={m} toast={toast} live={live} />}
    </div>
  );
}

function CohortTab({ st, set, onCsv, err, toast }) {
  const b = E.cohortBridge(st.cohort.rows);
  const copy = async () => { try { await navigator.clipboard.writeText(SAMPLE_CSV); toast("Sample CSV copied"); } catch { toast("Copy blocked here; select the text below"); } };
  return (
    <div className="stack">
      <div className="row between">
        <span className="small">Source: <b>{st.cohort.file}</b> <Tag s={st.cohort.uploaded ? "upload" : "synthetic"} /></span>
        <div className="row">
          <label className="btn sm" htmlFor="csv2">Upload cohort CSV</label><input id="csv2" type="file" accept=".csv,text/csv" hidden onChange={onCsv} />
          <button className="btn sm" onClick={copy}>Copy sample format</button>
          {st.cohort.uploaded && !st.cohort.live && <button className="btn sm" onClick={() => set({ cohort: { rows: COHORT_ROWS, file: "customer_cohort_FY26.csv", uploaded: false } })}>Reset to synthetic</button>}
        </div>
      </div>
      {err && <p style={{ color: "var(--risk)" }}>{err}</p>}
      <div className="table-wrap" style={{ maxHeight: 360 }}><table>
        <thead><tr><th>Row</th><th>Customer</th><th className="r">Opening ARR ($K)</th><th className="r">Ending ARR ($K)</th><th>Movement</th></tr></thead>
        <tbody>{st.cohort.rows.map((r, i) => { const mv = r.ending === 0 ? "churn" : r.ending < r.opening ? "contraction" : r.ending > r.opening ? "expansion" : "flat";
          return <tr key={i}><td className="num muted">{i + 2}</td><td>{r.customer}</td><td className="r num">{r.opening.toLocaleString()}</td><td className="r num">{r.ending.toLocaleString()}</td><td><Tag s={{ churn: "disputed", contraction: "assumption", expansion: "calculated", flat: "inferred" }[mv]}>{mv}</Tag></td></tr>; })}</tbody>
        <tfoot><tr><td></td><td><b>Totals</b></td><td className="r num"><b>{b.opening.toLocaleString()}</b></td><td className="r num"><b>{b.ending.toLocaleString()}</b></td><td className="small muted">Churn {b.churn} · contraction {b.contraction} · expansion {b.expansion}</td></tr></tfoot>
      </table></div>
    </div>
  );
}

function Discrepancy({ st, set, m, toast, live }) {
  const [reason, setReason] = useState("");
  const [cfo, setCfo] = useState(false);
  const b = m.bridge;
  const f = (x) => (x / 1000).toFixed(3);
  const request = `Hi — in reviewing the Series B materials we could not reproduce the 124% net revenue retention on slide 12. Using customer_cohort_FY26.csv (opening cohort of ${b.opening.toLocaleString()}K ARR at Sep 30, 2025) we calculate ${pct(m.nrr, 1)} NRR and ${pct(m.grr, 1)} GRR. Could you share (1) the NRR definition and period used on slide 12, (2) whether new-logo or services revenue is included, and (3) a monthly customer-level ARR bridge? Thank you.`;
  useEffect(() => { const k = (e) => e.key === "Escape" && set({ drawer: false }); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  return (
    <div className="overlay" onClick={() => set({ drawer: false })}>
      <aside className="drawer" role="dialog" aria-label="NRR evidence chain" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><div><span className="eyebrow" style={{ color: "var(--risk)" }}>Evidence chain · nrr_conflict_001</span><h1>Claimed 124% vs recomputed {pct(m.nrr, 1)}</h1></div>
          <button className="btn" onClick={() => set({ drawer: false })}>Close</button></div>

        <div className="stack"><span className="eyebrow">1 · The claim</span>
          <div className="slide"><span style={{ fontSize: 11, opacity: .6, letterSpacing: ".1em" }}>HELIOOPS · SERIES B · SLIDE 12 OF 18</span>
            <span style={{ fontSize: 22, fontWeight: 650 }}>Customers grow with us</span>
            <span style={{ fontSize: 15 }}>Net revenue retention: <span className="hl">124%</span></span>
            <span style={{ fontSize: 12, opacity: .7 }}>Trailing twelve months · enterprise accounts</span></div>
          <span className="src">HelioOps_SeriesB_Deck.pdf · page 12 · Company-reported · synthetic re-creation of slide</span></div>

        <div className="stack"><span className="eyebrow">2 · The underlying data</span>
          <span className="small">{st.cohort.file} · {st.cohort.rows.length} customers active at Sep 30, 2025 · new logos excluded by definition</span>
          <div className="grid g4">
            {[["Opening ARR", b.opening], ["Churn", -b.churn], ["Contraction", -b.contraction], ["Expansion", b.expansion]].map(([l, v]) => <div key={l} className="kpi"><span className="l">{l}</span><span className="v" style={{ fontSize: 18 }}>{v < 0 ? "−" : ""}${f(Math.abs(v))}M</span></div>)}
          </div></div>

        <div className="stack"><span className="eyebrow">3 · Reconciliation (deterministic calculator)</span>
          <div className="formula">NRR = (opening − churn − contraction + expansion) ÷ opening<br />
            &nbsp;&nbsp;&nbsp;&nbsp;= ({f(b.opening)} − {f(b.churn)} − {f(b.contraction)} + {f(b.expansion)}) ÷ {f(b.opening)} = <b>{pct(m.nrr, 1)}</b><br />
            GRR = ({f(b.opening)} − {f(b.churn)} − {f(b.contraction)}) ÷ {f(b.opening)} = <b>{pct(m.grr, 1)}</b><br />
            Gap vs claim = 124.0% − {pct(m.nrr, 1)} = <b style={{ color: "var(--risk)" }}>{m.gap.toFixed(1)} pp</b></div></div>

        <div className="stack"><span className="eyebrow">4 · Possible explanations (to verify, not conclusions)</span>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>The deck may include new-logo ramp from customers signed during the year.</li>
            <li>Churned customers may have been dropped from the starting base.</li>
            <li>A different period, such as an annualized strong quarter, may have been used.</li>
            <li>Services or implementation fees may be counted as recurring revenue.</li>
          </ul>
          {(() => { const top = [...st.cohort.rows].sort((x, y) => (y.ending - y.opening) - (x.ending - x.opening))[0]; const e = top ? top.ending - top.opening : 0;
            return e > 0 ? <span className="small muted">Expansion is concentrated: {top.customer} alone added ${f(e)}M of the ${f(b.expansion)}M.</span> : null; })()}</div>

        <div className="stack"><span className="eyebrow">5 · Request to CFO (draft, not sent)</span>
          <textarea id="cfo-req" rows={6} defaultValue={request} />
          <div className="row"><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(request); toast("Request copied"); } catch { toast("Copy blocked; select the text"); } }}>Copy request</button>
            <button className="btn" onClick={() => { setCfo(true); toast("Logged as diligence task · owner H. Kishore"); set({ tasks: st.tasks.some((t) => t.id === "nrr") ? st.tasks : [{ id: "nrr", text: "CFO: NRR definition and monthly customer ARR bridge", owner: "H. Kishore", done: false, impact: "Resolves IC blocker" }, ...st.tasks] }); }} disabled={cfo}>{cfo ? "Task logged" : "Log as diligence task"}</button></div>
          <span className="small muted">Conviction AI never contacts companies on its own; you send it.</span></div>

        <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}><span className="eyebrow">6 · Reviewer resolution</span>
          <select className="select" id="res" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a resolution…</option>
            <option>Deck included new-logo ARR; 113% confirmed by CFO</option>
            <option>Different period used; 113% is correct for FY26</option>
            <option>Services revenue included in deck; 113% confirmed</option>
          </select>
          <div className="row"><button className="btn primary" disabled={!reason} onClick={() => {
            const done = () => { set({ nrrResolution: reason, drawer: false }); toast(live ? "NRR resolved · saved to Postgres" : "NRR resolved · blocker cleared"); };
            if (live) api.resolveClaim("cl-nrr-claim", reason, "H. Kishore").then(done).catch((e) => toast(`Not saved: ${e.message}`)); else done(); }}>Mark resolved</button>
            <span className="small muted">Only resolve after the company's answer is in hand.</span></div></div>
      </aside>
    </div>
  );
}

function CrestlineProfile({ go }) {
  const c = CRESTLINE;
  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">PE mode · Fund IV Buyout</div><h1>Crestline Field Systems</h1>
        <p>Founder-owned service-software and maintenance workflow provider. Fictional company. PE mode asks a different question: can we buy durable cash flow at a price that returns capital?</p></div>
        <button className="btn primary" onClick={() => go("underwriting")}>LBO-lite →</button></div>
      <div className="grid g4">
        <div className="panel"><Num label="Revenue (LTM)" value={fmtM(c.revenue, 0)} status="company" src="CIM, unaudited" /></div>
        <div className="panel"><Num label="Adjusted EBITDA" value={fmtM(c.adjEbitda)} status="disputed" sub="Seller-adjusted" src="CIM p.22" /></div>
        <div className="panel"><Num label="Unadjusted EBITDA" value={fmtM(c.unadjEbitda)} status="company" src="Management accounts" /></div>
        <div className="panel"><Num label="Contracted revenue" value={pct(c.contracted)} status="company" sub={`Top customer ${pct(c.topCustomer)}`} src="CIM p.14" /></div>
      </div>
      <div className="panel"><h2>EBITDA adjustments bridge</h2>
        <div className="table-wrap"><table><thead><tr><th>Item</th><th className="r">$M</th><th>Status</th></tr></thead>
          <tbody><tr><td>Unadjusted EBITDA</td><td className="r num">{c.unadjEbitda.toFixed(1)}</td><td><Tag s="company" /></td></tr>
            {c.adjustments.map((a) => <tr key={a.item}><td>+ {a.item}</td><td className="r num">{a.amount.toFixed(1)}</td><td><Tag s={a.status} /></td></tr>)}
            <tr><td><b>Seller-adjusted EBITDA</b></td><td className="r num"><b>{c.adjEbitda.toFixed(1)}</b></td><td><Tag s="missing">Not QoE-reviewed</Tag></td></tr></tbody></table></div>
        <p className="small muted">Management is planning to retire, so management continuity is a separate diligence track.</p></div>
    </div>
  );
}

// ---------------- Underwriting ----------------
export function Underwriting({ st, set }) {
  if (st.mode === "pe") return <LboLab st={st} set={set} />;
  const u = st.uw;
  const upd = (p) => set({ uw: { ...u, ...p } });
  const tam = E.tam(u.universe, u.spend), sam = E.tam(u.reachable, u.spend), som = E.som(u.customers, u.acv);
  const grid = E.somGrid([125, 250, 400], [120000, 180000, 240000]);
  const sc = u.scen.map((s) => ({ ...s, ...E.vcScenario({ exitArr: s.arr, exitMultiple: s.mult, exitOwnership: u.exitOwn, investment: u.inv, years: u.years }) }));
  const maxM = Math.max(...sc.map((s) => s.moic), 3);
  const updS = (i, p) => upd({ scen: u.scen.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <div className="page">
      <div className="page-head"><div><div className="crumbs"><a href="#company">HelioOps</a> / <span>Underwriting</span></div><h1>TAM and returns lab</h1>
        <p>Every output is arithmetic you can trace. Inputs marked Assumption are analyst choices; change them and every dependent number updates.</p></div>
        <button className="btn" onClick={() => set({ uw: DEFAULT_UW })}>Reset assumptions</button></div>
      <div className="grid g2">
        <div className="panel">
          <div className="panel-head"><h2>Bottom-up market size</h2><Tag s="assumption" /></div>
          <div className="grid g2">
            <Field id="u-univ" label="Eligible buyer organizations" value={u.universe} min={20000} max={120000} step={1000} onChange={(v) => upd({ universe: v })} suffix={(v) => v.toLocaleString()} />
            <Field id="u-reach" label="Reachable mid/large orgs" value={u.reachable} min={5000} max={40000} step={500} onChange={(v) => upd({ reachable: v })} suffix={(v) => v.toLocaleString()} />
            <Field id="u-spend" label="Annual software spend / buyer" value={u.spend} min={50000} max={300000} step={5000} onChange={(v) => upd({ spend: v })} suffix={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Field id="u-cust" label="Customers won in 5 years" value={u.customers} min={50} max={600} step={5} onChange={(v) => upd({ customers: v })} suffix={(v) => v} />
            <Field id="u-acv" label="Modeled ACV" value={u.acv} min={60000} max={300000} step={5000} onChange={(v) => upd({ acv: v })} suffix={(v) => `$${(v / 1000).toFixed(0)}k`} />
          </div>
          <div className="row" style={{ gap: 26 }}>
            <div className="kpi"><span className="l">TAM</span><span className="v">{fmtM(tam / 1e6, 2)}</span></div>
            <div className="kpi"><span className="l">SAM</span><span className="v">{fmtM(sam / 1e6, 2)}</span></div>
            <div className="kpi"><span className="l">5-year SOM (ARR)</span><span className="v">{fmtM(som / 1e6, 1)}</span></div>
          </div>
          <span className="small muted">SOM is a company revenue scenario, not a market measurement. Sales capacity, implementation throughput and churn sit outside this model.</span>
          <div className="table-wrap"><table>
            <thead><tr><th>Customers \ ACV</th>{["$120k", "$180k", "$240k"].map((a) => <th key={a} className="r">{a}</th>)}</tr></thead>
            <tbody>{[125, 250, 400].map((c, i) => <tr key={c}><td className="num">{c}</td>{grid[i].map((v, j) => <td key={j} className="r num" style={c === u.customers && [120000, 180000, 240000][j] === u.acv ? { background: "var(--accentsoft)", fontWeight: 700 } : null}>{fmtM(v / 1e6, 1)}</td>)}</tr>)}</tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>VC exit scenarios</h2><span className="small muted">{u.years}-year hold · single cash in, single cash out</span></div>
          <div className="grid g3">
            <Field id="u-inv" label="Investment" value={u.inv} min={5} max={30} step={1} onChange={(v) => upd({ inv: v })} suffix={(v) => `$${v}M`} />
            <Field id="u-own" label="Exit ownership (diluted)" value={u.exitOwn} min={0.05} max={0.2} step={0.005} onChange={(v) => upd({ exitOwn: v })} suffix={(v) => pct(v, 1)} />
            <Field id="u-yrs" label="Years to exit" value={u.years} min={3} max={8} step={1} onChange={(v) => upd({ years: v })} suffix={(v) => `${v}`} />
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Scenario</th><th className="r">Exit ARR</th><th className="r">EV/ARR</th><th className="r">Exit value</th><th className="r">Proceeds</th><th className="r">MOIC</th><th className="r">IRR</th></tr></thead>
            <tbody>{sc.map((s, i) => <tr key={s.name}>
              <td><b>{s.name}</b></td>
              <td className="r"><input aria-label={`${s.name} exit ARR`} className="num" type="number" value={s.arr} min={0} step={1} onChange={(e) => updS(i, { arr: Number(e.target.value) })} style={{ width: 62, textAlign: "right", border: "1px solid var(--line)", borderRadius: 5, background: "var(--panel)", padding: "2px 4px" }} /></td>
              <td className="r"><input aria-label={`${s.name} multiple`} className="num" type="number" value={s.mult} min={0} step={0.5} onChange={(e) => updS(i, { mult: Number(e.target.value) })} style={{ width: 52, textAlign: "right", border: "1px solid var(--line)", borderRadius: 5, background: "var(--panel)", padding: "2px 4px" }} /></td>
              <td className="r num">{fmtM(s.ev, 0)}</td><td className="r num">{fmtM(s.proceeds, 2)}</td>
              <td className="r num" style={{ color: s.moic < 1 ? "var(--risk)" : "var(--ink)", fontWeight: 600 }}>{mult(s.moic)}</td>
              <td className="r num" style={{ color: (s.irr ?? -1) < 0 ? "var(--risk)" : "var(--ink)" }}>{s.irr == null ? "—" : pct(s.irr, 1)}</td></tr>)}</tbody>
          </table></div>
          <div className="stack">{sc.map((s) => (
            <div key={s.name} className="row" style={{ gap: 10 }}><span className="small" style={{ width: 70 }}>{s.name}</span>
              <div style={{ flex: 1, position: "relative" }}><Bar v={s.moic} max={maxM} color={s.moic < 1 ? "var(--risk)" : "var(--accent)"} />
                <i style={{ position: "absolute", left: `${(1 / maxM) * 100}%`, top: -3, bottom: -3, width: 1, background: "var(--ink)" }} title="1.0x" /></div>
              <span className="num small" style={{ width: 52, textAlign: "right" }}>{mult(s.moic, 1)}</span></div>))}
            <span className="small muted">Vertical line marks 1.0x. Entry: ${HELIO.raise}M at ${HELIO.postMoney}M post ({pct(HELIO.raise / HELIO.postMoney, 2)} at close), {(HELIO.postMoney / HELIO.arrNow).toFixed(1)}x current ARR. Zero net debt and no preference effects assumed.</span></div>
        </div>
      </div>
    </div>
  );
}

export const DEFAULT_UW = { universe: 65000, reachable: 18000, spend: 150000, customers: 250, acv: 180000, inv: 14, exitOwn: 0.12, years: 5,
  scen: [{ name: "Downside", arr: 18, mult: 3 }, { name: "Base", arr: 48, mult: 6 }, { name: "Upside", arr: 85, mult: 9 }] };

export const DEFAULT_LBO = { entryMultiple: 9, leverage: 4, rate: 0.09, growth: 0.06, cashConversion: 0.75, exitMultiple: 9, years: 5, priceOn: "adjusted", accepted: {} };

export function acceptedEbitda(lb) {
  return CRESTLINE.unadjEbitda + CRESTLINE.adjustments.reduce((s, a) => s + (lb.accepted[a.item] ? a.amount : 0), 0);
}

function LboLab({ st, set }) {
  const lb = st.lbo;
  const upd = (p) => set({ lbo: { ...lb, ...p } });
  const opE = acceptedEbitda(lb);
  const priceE = lb.priceOn === "adjusted" ? CRESTLINE.adjEbitda : opE;
  const r = E.lbo({ ...lb, priceEbitda: priceE, operatingEbitda: opE, capex: CRESTLINE.capex });
  const ref = E.lbo({ ...lb, priceEbitda: opE, operatingEbitda: opE, capex: CRESTLINE.capex });
  const maxD = r.debt0;
  return (
    <div className="page">
      <div className="page-head"><div><div className="crumbs"><a href="#company">Crestline</a> / <span>LBO-lite</span></div><h1>LBO-lite · Crestline Field Systems</h1>
        <p>Not a replacement for a bank model or a Quality of Earnings report. It shows how much of the return depends on EBITDA you have not yet verified.</p></div>
        <button className="btn" onClick={() => set({ lbo: DEFAULT_LBO })}>Reset</button></div>
      <div className="grid g2">
        <div className="panel">
          <h2>EBITDA you accept</h2>
          <div className="stack">{CRESTLINE.adjustments.map((a) => (
            <label key={a.item} className="row between small" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
              <span className="row"><input type="checkbox" checked={!!lb.accepted[a.item]} onChange={(e) => upd({ accepted: { ...lb.accepted, [a.item]: e.target.checked } })} />{a.item} <Tag s={a.status} /></span><span className="num">+{a.amount.toFixed(1)}</span></label>))}</div>
          <div className="row between"><span>Diligence-accepted EBITDA</span><b className="num">{fmtM(opE)}</b></div>
          <div className="field"><label>Price the deal on</label>
            <div className="seg-ctl">{[["adjusted", `Seller-adjusted $${CRESTLINE.adjEbitda.toFixed(1)}M`], ["accepted", `Accepted $${opE.toFixed(1)}M`]].map(([v, l]) => <button key={v} className={lb.priceOn === v ? "on" : ""} onClick={() => upd({ priceOn: v })}>{l}</button>)}</div></div>
          <div className="grid g2">
            <Field id="l-em" label="Entry EV/EBITDA" value={lb.entryMultiple} min={6} max={13} step={0.5} onChange={(v) => upd({ entryMultiple: v })} suffix={(v) => `${v}x`} />
            <Field id="l-lev" label="Debt / priced EBITDA" value={lb.leverage} min={0} max={6} step={0.25} onChange={(v) => upd({ leverage: v })} suffix={(v) => `${v}x`} />
            <Field id="l-rate" label="Interest rate" value={lb.rate} min={0.05} max={0.13} step={0.0025} onChange={(v) => upd({ rate: v })} suffix={(v) => pct(v, 2)} />
            <Field id="l-g" label="EBITDA growth / yr" value={lb.growth} min={-0.05} max={0.15} step={0.005} onChange={(v) => upd({ growth: v })} suffix={(v) => pct(v, 1)} />
            <Field id="l-cc" label="Cash conversion (pre-capex)" value={lb.cashConversion} min={0.5} max={0.95} step={0.01} onChange={(v) => upd({ cashConversion: v })} suffix={(v) => pct(v)} />
            <Field id="l-xm" label="Exit EV/EBITDA" value={lb.exitMultiple} min={6} max={13} step={0.5} onChange={(v) => upd({ exitMultiple: v })} suffix={(v) => `${v}x`} />
          </div>
        </div>
        <div className="panel">
          <h2>Returns to equity</h2>
          <div className="grid g3">
            <div className="kpi"><span className="l">Entry EV</span><span className="v">{fmtM(r.ev)}</span></div>
            <div className="kpi"><span className="l">Debt · equity</span><span className="v" style={{ fontSize: 18 }}>{fmtM(r.debt0)} · {fmtM(r.equity0)}</span></div>
            <div className="kpi"><span className="l">Leverage on accepted</span><span className="v" style={{ color: r.actualLeverage > 4 ? "var(--risk)" : "var(--ink)" }}>{mult(r.actualLeverage, 2)}</span></div>
            <div className="kpi"><span className="l">Exit equity</span><span className="v">{fmtM(r.exitEquity)}</span></div>
            <div className="kpi"><span className="l">MOIC</span><span className="v">{mult(r.moic)}</span></div>
            <div className="kpi"><span className="l">IRR</span><span className="v" style={{ color: (r.irr ?? -1) < 0.2 ? "var(--warn)" : "var(--ok)" }}>{r.irr == null ? "—" : pct(r.irr, 1)}</span></div>
          </div>
          {lb.priceOn === "adjusted" && opE < CRESTLINE.adjEbitda && (
            <div className="callout warn small">Paying {lb.entryMultiple}x on seller-adjusted EBITDA while accepting only {fmtM(opE)} cuts IRR from {pct(ref.irr, 1)} to {pct(r.irr, 1)} and lifts real leverage to {mult(r.actualLeverage, 2)} against a 4.0x lender cap.</div>)}
          <span className="eyebrow">Debt paydown</span>
          <div className="stack">{[{ year: 0, debt: r.debt0 }, ...r.schedule].map((y) => (
            <div key={y.year} className="row" style={{ gap: 10 }}><span className="small num" style={{ width: 44 }}>Y{y.year}</span><div style={{ flex: 1 }}><Bar v={y.debt} max={maxD} color="var(--c2)" /></div><span className="num small" style={{ width: 64, textAlign: "right" }}>{fmtM(y.debt)}</span></div>))}</div>
          <span className="small muted">Cash for paydown = EBITDA × conversion − capex ${CRESTLINE.capex}M − interest. Fees, taxes beyond conversion, and working-capital swings are simplified.</span>
        </div>
      </div>
    </div>
  );
}

export { BEAR_CASE };

// ---------------- Company 360 for a researched (real) company, built from a company pack ----------------
const fmtDate = (d) => { if (!d) return ""; const t = new Date(d + (String(d).length === 10 ? "T12:00:00" : "")); return isNaN(t) ? String(d) : t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

function ResearchedCompany({ st, set, go, toast, conn }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("evidence");
  const slug = st.company;
  useEffect(() => { api.profile(slug).then(setP).catch((e) => setErr(e.message)); }, [slug]);
  if (err) return <div className="page"><div className="callout risk">Could not load {slug}: {err}</div><div className="row"><button className="btn" onClick={() => set({ company: "helioops" })}>Back to HelioOps</button></div></div>;
  if (!p) return <div className="page"><p className="muted">Loading company profile from Postgres…</p></div>;
  const a = p.account, claims = p.claims, byName = (n) => claims.find((c) => c.name === n);
  const round = p.funding_rounds[p.funding_rounds.length - 1];
  const raise = byName("Series A amount") || claims.find((c) => /amount/i.test(c.name) && c.status !== "disputed");
  const emp = byName("Employees");
  const missing = claims.filter((c) => c.is_critical && c.status === "missing");
  const disputed = claims.filter((c) => c.status === "disputed");
  const sources = [...new Map(claims.filter((c) => c.source_url).map((c) => [c.source_url, c])).values()];
  const retrieved = claims.map((c) => c.retrieved_date).filter(Boolean).sort().pop();
  const seg = p.segments.find((s) => s.is_primary);
  const request = `Data-room request for ${a.name}:\n` + missing.map((c, i) => `${i + 1}. ${c.name}${c.note ? ` (${c.note})` : ""}`).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(request); toast("Data-room request copied"); } catch { toast("Copy blocked here; select the text in the Evidence board"); } };
  const SourceCell = ({ c }) => c.source_url
    ? <span className="small"><a href={c.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{c.locator || c.source_title}</a>{c.note && <span className="muted"><br />{c.note}</span>}</span>
    : <span className="small muted">{c.note || "Not public"}</span>;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><a href="#markets">Radar</a> / <a href="#map">{seg ? seg.name : "Market"}</a> / <span>{a.name}</span></div>
          <h1>{a.name} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>· {a.description}</span></h1>
          <p>{[a.sub_segment, a.company_stage, [a.billing_city, a.billing_country].filter(Boolean).join(", "), a.founded_year && `founded ${a.founded_year}`, a.website].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="row"><CompanyPicker st={st} set={set} conn={conn} toast={toast} /></div>
      </div>

      <div className="callout warn">
        <div className="stack" style={{ gap: 6, flex: "1 1 320px" }}>
          <span className="eyebrow" style={{ color: "var(--warn)" }}>Researched from public sources · real company</span>
          <span>Built from {sources.length} public sources{retrieved ? `, retrieved ${fmtDate(retrieved)}` : ""}. {missing.length} critical metrics are not public{disputed.length ? ` and ${disputed.length} facts conflict between sources` : ""}, so no score is given until a data room arrives.</span>
        </div>
        <div className="row"><span className="rec more">MORE DILIGENCE</span><button className="btn" onClick={copy}>Copy data-room request</button></div>
      </div>

      <div className="grid g4">
        <div className="panel"><Num label={round ? `Last round · ${round.stage}` : "Last round"} value={raise && raise.value_text !== "—" ? raise.value_text : round ? fmtM(round.amount_usd_m) : "—"} status={raise ? raise.status : "missing"} sub={round ? round.quarter : null} src={round && round.investors.length ? `${round.investors.length} investors` : null} /></div>
        <div className="panel"><Num label="Net revenue retention" value={p.retention ? pct(p.retention.nrr, 0) : "—"} status={p.retention ? "calculated" : "missing"} sub={p.retention ? `GRR ${pct(p.retention.grr)}` : "Not public"} src={p.retention ? "Recomputed · rows from Postgres" : "Needs customer-level ARR"} /></div>
        <div className="panel"><Num label="Employees" value={emp ? emp.value_text : a.number_of_employees || "—"} status={emp ? emp.status : "missing"} src={emp && emp.locator} /></div>
        <div className="panel"><Num label="Evidence coverage" value={pct(p.coverage.pct)} sub={`${p.coverage.ok}/${p.coverage.total} critical claims evidenced`} src="≥65% to discuss, ≥85% for IC" /></div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="tabs" role="tablist">{[["evidence", "Evidence board"], ["people", "Founders · funding"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
          <span className="small muted">{claims.length} claims · {missing.length} missing · {disputed.length} disputed</span>
        </div>
        {tab === "evidence" && (
          <div className="table-wrap"><table>
            <thead><tr><th>Claim</th><th>Value</th><th>Status</th><th>Source &amp; note</th></tr></thead>
            <tbody>{claims.map((c) => (
              <tr key={c.id}><td>{c.name}{c.is_critical && <span className="muted small"> · critical</span>}</td><td className="num">{c.value_text}</td><td><Tag s={c.status} /></td><td><SourceCell c={c} /></td></tr>))}</tbody>
          </table></div>
        )}
        {tab === "people" && (
          <div className="grid g2">
            <div className="stack"><span className="eyebrow">Founders and leadership</span>
              {p.contacts.length ? p.contacts.map((f) => <div key={f.name} className="card"><b>{f.name} · {f.title}</b><span className="small">{f.domain_evidence}</span><Tag s={f.evidence_status} /></div>)
                : <span className="small muted">No founders named in the sources.</span>}
              <span className="small muted">Scored on domain insight and execution evidence only. No inference from protected traits.</span></div>
            <div className="stack"><span className="eyebrow">Funding history</span>
              <div className="table-wrap"><table>
                <thead><tr><th>Round</th><th>Quarter</th><th className="r">USD</th><th>Investors</th></tr></thead>
                <tbody>{p.funding_rounds.map((r) => <tr key={r.id}><td><b>{r.stage}</b></td><td className="num">{r.quarter}</td><td className="r num">{fmtM(r.amount_usd_m)}</td>
                  <td className="small">{r.investors.join(", ")}<br /><a href={r.source} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>source</a></td></tr>)}</tbody>
              </table></div>
              {p.opportunity && <span className="small">In pipeline: <b>{p.opportunity.stage_name}</b> · {p.opportunity.round_label} · {p.opportunity.owner_name}{p.opportunity.flag ? ` · ${p.opportunity.flag}` : ""} <button className="linkish" onClick={() => go("pipeline")}>Open pipeline →</button></span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
