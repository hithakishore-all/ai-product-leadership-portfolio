import { VC_DIMS, PE_DIMS, BEAR_CASE, HELIO, CRESTLINE, AS_OF } from "./data.js";
import * as E from "./engine.js";
import { claimsFor, helioMetrics, vcDecision, radar } from "./model.js";
import { acceptedEbitda } from "./screens2.jsx";
import { Tag, fmtM, pct, mult } from "./ui.jsx";
const { useState } = React;

function Scorecard({ dims, setDims }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Dimension</th><th className="r">Weight</th><th>Score (1–5)</th><th>Evidence note</th></tr></thead>
      <tbody>{dims.map((d, i) => (
        <tr key={d.id}><td><b>{d.name}</b></td><td className="r num">{d.weight}</td>
          <td><select className="select" aria-label={`${d.name} score`} value={d.score ?? ""} onChange={(e) => setDims(dims.map((x, j) => (j === i ? { ...x, score: e.target.value === "" ? null : Number(e.target.value) } : x)))}>
            <option value="">Unknown</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
          <td className="small muted">{d.note}</td></tr>))}</tbody>
    </table></div>
  );
}

function ScoreHead({ q, cov, rec, cls, extra }) {
  return (
    <div className="strip" style={{ gridTemplateColumns: "minmax(0,1.6fr) repeat(2, minmax(0,1fr))" }}>
      <div className="kpi"><span className="l">Recommendation</span><span><span className={`rec ${cls}`}>{rec}</span></span><span className="small muted">Rule-based category for human review, not a predicted outcome</span></div>
      <div className="kpi"><span className="l">Qualification score</span><span className="v">{q.score == null ? "—" : q.score.toFixed(0)}<span className="small muted"> /100</span></span><span className="small muted">Rubric coverage {pct(q.rubricCoverage)}</span></div>
      <div className="kpi"><span className="l">Evidence coverage</span><span className="v">{pct(cov)}</span><span className="small muted">{extra}</span></div>
    </div>
  );
}

export function Decision(props) {
  return props.st.mode === "pe" ? <PeDecision {...props} /> : <VcDecision {...props} />;
}

function VcDecision({ st, set, fit, toast }) {
  const [bearStep, setBearStep] = useState(st.bear ? BEAR_CASE.length : 0);
  const [memo, setMemo] = useState(null);
  const claims = claimsFor(st);
  const m = helioMetrics(st);
  const d = vcDecision(st, claims, fit);
  const q = E.qualification(st.vcDims);
  const canSign = st.dataRoom && d.blockers.length === 0 && d.cov.pct >= 0.85;

  const runBear = () => {
    set({ bear: true });
    let i = 0; const tick = () => { i += 1; setBearStep(i); if (i < BEAR_CASE.length) setTimeout(tick, 380); };
    setTimeout(tick, 250);
    const add = BEAR_CASE.map((b, k) => ({ id: k === 0 ? "nrr" : "b" + k, text: b.task.text, owner: b.task.owner, done: false, impact: b.task.impact, cites: b.cites }));
    const ids = new Set(st.tasks.map((t) => t.id));
    set({ bear: true, tasks: [...st.tasks, ...add.filter((t) => !ids.has(t.id))] });
    toast("Bear case generated · 4 diligence tasks created");
  };
  const toggleTask = (t) => {
    const done = !t.done;
    const rec = { ...st.received };
    (t.cites || []).forEach((c) => { if (["cl-renew", "cl-svc"].includes(c)) rec[c] = done; });
    set({ tasks: st.tasks.map((x) => (x.id === t.id ? { ...x, done } : x)), received: rec });
  };

  return (
    <div className="page">
      <div className="page-head"><div><div className="crumbs"><a href="#company">HelioOps</a> / <span>Decision cockpit</span></div><h1>Should Fund II advance HelioOps?</h1>
        <p>Score and evidence coverage are separate measures. A high score never bypasses a blocker; the investment team owns the decision.</p></div>
        <button className="btn primary" onClick={() => setMemo(buildVcMemo(st, claims, m, d, q))}>Prepare IC memo</button></div>
      <ScoreHead q={q} cov={d.cov.pct} rec={d.rec} cls={d.cls} extra={`${d.cov.ok}/${d.cov.total} critical claims · ≥65% to discuss, ≥85% for IC`} />
      <div className="grid g2">
        <div className="panel">
          <h2>Blockers and conditions</h2>
          {d.blockers.length === 0 && d.missing.length === 0 ? <div className="callout ok small">No blockers and no missing critical evidence.</div> : null}
          <div className="stack">
            {d.blockers.map((b) => <div key={b} className="row small" style={{ gap: 8 }}><Tag s="disputed">Blocker</Tag>{b}</div>)}
            {d.missing.map((b) => <div key={b} className="row small" style={{ gap: 8 }}><Tag s="missing">Missing</Tag>{b}</div>)}
          </div>
          <label className="row small" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <input type="checkbox" disabled={!canSign} checked={!!st.signedOff && canSign} onChange={(e) => set({ signedOff: e.target.checked })} />
            Reviewer sign-off: I have read the evidence and approve this for IC {canSign ? "" : <span className="muted">(available once blockers clear and coverage reaches 85%)</span>}</label>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Bear case</h2>{!st.bear && <button className="btn" onClick={runBear}>Make the bear case</button>}</div>
          {!st.bear ? <p className="muted">Argues against the deal from the evidence board: unsupported claims, alternative explanations, and what would change the recommendation.</p> : (
            <div className="stack">
              <span className="small"><Tag s="inferred">Demo response</Tag> <span className="muted">Deterministic analyst output, no live model connected. Every point cites claim IDs.</span></span>
              {BEAR_CASE.slice(0, bearStep).map((b) => (
                <div key={b.title} className="card"><b>{b.title}</b><span className="small">{b.body}</span>
                  <span className="row small muted" style={{ gap: 4 }}>Cites: {b.cites.map((c) => <code key={c} className="num" style={{ fontSize: 11 }}>{c}</code>)}</span></div>))}
            </div>)}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>Diligence tasks</h2><span className="small muted">Completing a task marks the requested evidence as received, pending review</span></div>
        {st.tasks.length === 0 ? <p className="muted">No tasks yet. Generate the bear case or log the CFO request from the NRR evidence chain.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th></th><th>Task</th><th>Owner</th><th>Decision impact</th></tr></thead>
            <tbody>{st.tasks.map((t) => <tr key={t.id}>
              <td><input type="checkbox" aria-label={`Done: ${t.text}`} checked={t.done} onChange={() => toggleTask(t)} /></td>
              <td style={t.done ? { textDecoration: "line-through", color: "var(--muted)" } : null}>{t.text}</td>
              <td><input aria-label="Owner" value={t.owner} onChange={(e) => set({ tasks: st.tasks.map((x) => (x.id === t.id ? { ...x, owner: e.target.value } : x)) })} style={{ border: "1px solid var(--line)", borderRadius: 5, padding: "2px 6px", width: 110, background: "var(--panel)" }} /></td>
              <td className="small muted">{t.impact}</td></tr>)}</tbody>
          </table></div>)}
      </div>
      <div className="panel"><h2>Qualification scorecard · Growth VC</h2><Scorecard dims={st.vcDims} setDims={(v) => set({ vcDims: v })} /></div>
      {memo && <MemoView memo={memo} onClose={() => setMemo(null)} toast={toast} />}
    </div>
  );
}

function PeDecision({ st, set, toast }) {
  const [memo, setMemo] = useState(null);
  const lb = st.lbo;
  const opE = acceptedEbitda(lb);
  const r = E.lbo({ ...lb, priceEbitda: opE, operatingEbitda: opE, capex: CRESTLINE.capex });
  const reviewed = st.qoeReviewed;
  const dims = st.peDims.map((x) => (x.id === "qoe" && reviewed ? { ...x, score: x.score ?? 3 } : x.id === "val" && reviewed ? { ...x, score: x.score ?? (r.irr >= 0.25 ? 4 : r.irr >= 0.2 ? 3 : 2) } : x));
  const q = E.qualification(dims);
  const gates = [
    { label: "EBITDA adjustments reviewed (QoE)", ok: reviewed },
    { label: `Leverage ≤ 4.0x on accepted EBITDA (${mult(r.actualLeverage, 2)})`, ok: r.actualLeverage <= 4.0001 },
    { label: `Modeled IRR ≥ 20% hurdle (${r.irr == null ? "—" : pct(r.irr, 1)})`, ok: reviewed && r.irr >= 0.2 },
    { label: "Top customer ≤ 20% of revenue (16%)", ok: true },
    { label: "Management succession plan", ok: false, cond: true },
  ];
  const hard = gates.filter((g) => !g.ok && !g.cond);
  const rec = !reviewed ? "INSUFFICIENT EVIDENCE TO PRICE" : hard.length ? "PASS AT THIS PRICE" : "ADVANCE WITH CONDITIONS";
  const cls = !reviewed ? "more" : hard.length ? "stop" : "cond";
  const cov = reviewed ? 0.8 : 0.55;
  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">PE mode · Fund IV Buyout</div><h1>Can we buy Crestline at a return-producing price?</h1>
        <p>A different scorecard from VC: quality of earnings, cash conversion, leverage and downside lead. Founder fit does not appear here.</p></div>
        <button className="btn primary" onClick={() => setMemo(buildPeMemo(rec, gates, r, opE, q))}>Prepare IC memo</button></div>
      <ScoreHead q={q} cov={cov} rec={rec} cls={cls} extra={reviewed ? "QoE reviewed; contracts pending" : "QoE not yet reviewed"} />
      <div className="grid g2">
        <div className="panel"><h2>Hard gates</h2>
          <div className="stack">{gates.map((g) => <div key={g.label} className="row small" style={{ gap: 8 }}><Tag s={g.ok ? "calculated" : g.cond ? "missing" : "disputed"}>{g.ok ? "Pass" : g.cond ? "Condition" : "Fail"}</Tag>{g.label}</div>)}</div>
          <label className="row small" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}><input type="checkbox" checked={!!reviewed} onChange={(e) => set({ qoeReviewed: e.target.checked })} />QoE review of EBITDA adjustments complete (accepted items set in LBO-lite)</label></div>
        <div className="panel"><h2>Returns on accepted EBITDA</h2>
          <div className="grid g3">
            <div className="kpi"><span className="l">Accepted EBITDA</span><span className="v">{fmtM(opE)}</span></div>
            <div className="kpi"><span className="l">MOIC</span><span className="v">{mult(r.moic)}</span></div>
            <div className="kpi"><span className="l">IRR</span><span className="v">{pct(r.irr, 1)}</span></div>
          </div>
          <span className="small muted">Priced at {lb.entryMultiple}x accepted EBITDA, {lb.leverage}x debt, {lb.years}-year hold, exit at {lb.exitMultiple}x.</span></div>
      </div>
      <div className="panel"><h2>Qualification scorecard · PE Buyout</h2><Scorecard dims={st.peDims} setDims={(v) => set({ peDims: v })} /></div>
      {memo && <MemoView memo={memo} onClose={() => setMemo(null)} toast={toast} />}
    </div>
  );
}

// ---------------- Memo ----------------
function buildVcMemo(st, claims, m, d, q) {
  const u = st.uw;
  const sc = u.scen.map((s) => ({ ...s, ...E.vcScenario({ exitArr: s.arr, exitMultiple: s.mult, exitOwnership: u.exitOwn, investment: u.inv, years: u.years }) }));
  const seg = radar(st.excludeTop).find((s) => s.id === "po");
  const loaded = st.dataRoom;
  return {
    title: "HelioOps · Series B · Investment Committee Memo",
    meta: `Fund II · Growth VC · as of ${AS_OF} · prepared ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · SYNTHETIC DEMO DATA`,
    rec: d.rec, cls: d.cls,
    sections: [
      ["Recommendation", [`${d.rec}. Qualification score ${q.score == null ? "n/a" : q.score.toFixed(0)}/100 with ${pct(d.cov.pct)} evidence coverage (${d.cov.ok}/${d.cov.total} critical claims).`,
        ...(d.blockers.length || d.missing.length ? [`Conditions before IC: ${[...d.blockers, ...d.missing.map((x) => `obtain ${x.toLowerCase()}`)].join("; ")}.`] : [])]],
      ["Thesis and fund fit", ["HelioOps sells AI workflow execution to industrial equipment OEMs and field-service providers, inside Fund II's \"AI for the physical economy\" thesis. Proposed: $14M primary at $72M pre / $86M post (16.28% at close)."]],
      ["Market and technology inflection", [`Physical Operations AI scores ${seg.index.toFixed(0)} on the inflection index and ranks #${seg.rank}${st.excludeTop ? ` with the top ${st.excludeTop} rounds excluded` : ""}. Adoption is ${seg.adoption}/100 with ${pct(seg.coverage)} evidence coverage. Contrary view: ${seg.contrary}`]],
      ["Market size", [`Bottom-up TAM ${fmtM(E.tam(u.universe, u.spend) / 1e6, 2)} (${u.universe.toLocaleString()} buyers × $${(u.spend / 1000).toFixed(0)}k), SAM ${fmtM(E.tam(u.reachable, u.spend) / 1e6, 2)}, five-year SOM ${fmtM(E.som(u.customers, u.acv) / 1e6, 1)} ARR. All analyst assumptions.`]],
      ["Operating and financial assessment", loaded ? [`ARR $6.4M, up ${pct(m.growth)} year over year (company-reported ledger). Recomputed NRR ${pct(m.nrr, 1)} and GRR ${pct(m.grr, 1)} from cohort data, versus 124% claimed in the deck${st.nrrResolution ? ` (resolved: ${st.nrrResolution})` : " — unreconciled"}. Gross margin 78% (unaudited). Runway ${m.runway.toFixed(0)} months. Largest customer 21.5% of ARR; top three 39%.`] : ["Company data room not yet reviewed; no operating metrics are asserted."]],
      ["Underwriting scenarios", sc.map((s) => `${s.name}: $${s.arr}M exit ARR × ${s.mult}x = ${fmtM(s.ev, 0)}; ${pct(u.exitOwn, 1)} ownership returns ${fmtM(s.proceeds, 2)} → ${mult(s.moic)} MOIC, ${s.irr == null ? "n/a" : pct(s.irr, 1)} IRR over ${u.years} years.`)],
      ["Key risks and contrary evidence", BEAR_CASE.map((b) => `${b.title}. ${b.body}`)],
      ["Open diligence", st.tasks.length ? st.tasks.map((t) => `${t.done ? "[done] " : ""}${t.text} — ${t.owner}`) : ["No diligence tasks logged."]],
      ["Sources and assumptions", claims.filter((c) => c.status !== "missing").map((c) => `${c.prop}: ${c.value} — ${c.source} [${c.status}]`)],
      ["Reviewer note", ["Draft generated from frozen evidence and calculator outputs. Model-generated text is never cited as evidence. Requires reviewer approval before distribution."]],
    ],
  };
}

function buildPeMemo(rec, gates, r, opE, q) {
  return {
    title: "Crestline Field Systems · Buyout · IC Memo",
    meta: `Fund IV · PE Buyout · as of ${AS_OF} · SYNTHETIC DEMO DATA`, rec, cls: rec.startsWith("ADV") ? "cond" : rec.startsWith("PASS") ? "stop" : "more",
    sections: [
      ["Recommendation", [`${rec}. PE qualification score ${q.score == null ? "n/a" : q.score.toFixed(0)}/100 on ${pct(q.rubricCoverage)} of the rubric.`]],
      ["Earnings quality", [`Seller-adjusted EBITDA $11.0M vs unadjusted $9.4M. Diligence-accepted EBITDA ${fmtM(opE)}. The $0.4M pro forma pricing adjustment is disputed.`]],
      ["Returns", [`On accepted EBITDA: entry EV ${fmtM(r.ev)}, equity ${fmtM(r.equity0)}, exit equity ${fmtM(r.exitEquity)}, ${mult(r.moic)} MOIC, ${pct(r.irr, 1)} IRR.`]],
      ["Gates", gates.map((g) => `${g.ok ? "Pass" : g.cond ? "Condition" : "Fail"}: ${g.label}`)],
      ["Reviewer note", ["LBO-lite only; not a substitute for a formal Quality of Earnings or lender model. Requires reviewer approval before distribution."]],
    ],
  };
}

function memoMarkdown(m) {
  return [`# ${m.title}`, `_${m.meta}_`, "", ...m.sections.flatMap(([h, items]) => [`## ${h}`, ...(items.length > 1 ? items.map((i) => `- ${i}`) : items), ""])].join("\n");
}

function MemoView({ memo, onClose, toast }) {
  const copy = async () => { try { await navigator.clipboard.writeText(memoMarkdown(memo)); toast("Memo copied as Markdown"); } catch { toast("Copy blocked here; select the memo text"); } };
  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label="IC memo" style={{ width: "min(860px, 100%)", background: "var(--bg)" }} onClick={(e) => e.stopPropagation()}>
        <div className="row between"><span className="eyebrow">IC memo preview · draft for reviewer approval</span>
          <div className="row"><button className="btn" onClick={copy}>Copy as Markdown</button><button className="btn" onClick={onClose}>Close</button></div></div>
        <article className="memo">
          <Tag s="synthetic">Synthetic demo · not investment advice</Tag>
          <h1>{memo.title}</h1>
          <span className="small muted" style={{ fontFamily: "var(--f-ui)" }}>{memo.meta}</span>
          <span><span className={`rec ${memo.cls}`}>{memo.rec}</span></span>
          {memo.sections.map(([h, items]) => (
            <section key={h} className="stack" style={{ gap: 6 }}><h2>{h}</h2>
              {items.length > 1 ? <ul>{items.map((i, k) => <li key={k}>{i}</li>)}</ul> : <p>{items[0]}</p>}</section>))}
        </article>
      </aside>
    </div>
  );
}

// ---------------- Ask Conviction ----------------
export const SUGGESTIONS = ["Which markets are accelerating but underpenetrated?", "Why is HelioOps' NRR flagged?", "Make the bear case for HelioOps", "What returns does the base case imply?"];

export function answer(qText, st) {
  const t = qText.toLowerCase();
  if (/bear|wrong|against|risk/.test(t)) return { text: "Four counter-points from the evidence board: retention is weaker than presented (113% vs 124%), one customer drives most expansion, services work may be hiding in margin, and the data moat is asserted only. Each comes with a diligence task.", cites: ["cl-nrr-claim", "cl-nrr-calc", "cl-conc", "cl-svc", "cl-moat"], action: ["Open bear case", "decision"] };
  if (/nrr|retention|124|113|discrep|contradict/.test(t)) { const m = helioMetrics(st); return { text: `The deck claims 124% NRR (slide 12). The cohort file reconstructs ${pct(m.nrr, 1)}: (3.000 − 0.165 − 0.135 + 0.690) ÷ 3.000. The ${m.gap.toFixed(1)}pp gap stays flagged until a reviewer records a resolution.`, cites: ["cl-nrr-claim", "cl-nrr-calc"], action: ["Inspect evidence chain", "company", { drawer: true, dataRoom: true }] }; }
  if (/return|irr|moic|exit|valuation/.test(t)) { const u = st.uw; const b = u.scen[1]; const r = E.vcScenario({ exitArr: b.arr, exitMultiple: b.mult, exitOwnership: u.exitOwn, investment: u.inv, years: u.years }); return { text: `Base case: $${b.arr}M exit ARR × ${b.mult}x = ${fmtM(r.ev, 0)}. At ${pct(u.exitOwn, 1)} ownership that returns ${fmtM(r.proceeds, 2)} on $${u.inv}M: ${mult(r.moic)} MOIC, ${pct(r.irr, 1)} IRR. Computed by the returns engine; exit inputs are analyst assumptions.`, cites: ["assumption: exit ARR", "assumption: EV/ARR"], action: ["Open returns lab", "underwriting"] }; }
  if (/market|where|accelerat|trend|segment|underpenetr/.test(t)) { const r = radar(st.excludeTop); const top = r.slice(0, 3).map((s) => `${s.name} (${s.index.toFixed(0)}, adoption ${s.adoption})`).join(", "); return { text: `Top segments by inflection index${st.excludeTop ? ` with the top ${st.excludeTop} rounds excluded` : ""}: ${top}. Robotics orchestration and agent security have funding well ahead of adoption; Physical Operations AI combines high momentum with mid-range adoption, which is the underpenetrated profile.`, cites: ["synthetic segment signals"], action: ["Open radar", "markets"] }; }
  return { text: "I answer from the evidence in this workspace. Try one of the suggested questions.", cites: [] };
}
