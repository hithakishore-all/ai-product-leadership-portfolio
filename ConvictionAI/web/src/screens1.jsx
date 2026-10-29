import { SEGMENTS, ROUNDS, QUARTERS, INVESTORS, PO_COMPANIES, PO_TIMELINE, CHANGES, PIPELINE_STAGES, AS_OF } from "./data.js";
import { radar, excludedRoundIds } from "./model.js";
import { INDEX_WEIGHTS } from "./engine.js";
import { api } from "./api.js";
import { Tag, Bar, Scatter, StackedBars, Legend, SEG_COLOR, fmtM, pct } from "./ui.jsx";
const { useState, useMemo } = React;

const COMPONENTS = [["adoption", "Commercial adoption"], ["funding", "Funding momentum"], ["tech", "Technology readiness"], ["talent", "Talent & ecosystem"], ["whitespace", "Competitive whitespace"], ["catalysts", "Catalysts & timing"]];

export function ExcludeCtl({ value, onChange }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="small muted">Mega-rounds</span>
      <div className="seg-ctl" role="group" aria-label="Exclude largest rounds">
        {[[0, "Include all"], [1, "Exclude top 1"], [5, "Exclude top 5"]].map(([v, l]) => <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

// ---------------- Overview ----------------
export function Overview({ st, go, set }) {
  const r = radar(st.excludeTop);
  const openDeals = st.deals.filter((d) => d.stage !== "Closed / Passed").length;
  const exceptions = st.deals.filter((d) => d.flag && d.stage !== "Closed / Passed").length;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{st.mode === "pe" ? "Fund IV · PE Buyout" : "Fund II · Growth VC"} · as of {AS_OF}</div>
          <h1>Where conviction is building this quarter</h1>
          <p>Six enterprise-AI segments tracked across adoption, capital, technology and timing. Funding alone is not adoption: toggle mega-rounds to see which markets hold up.</p>
        </div>
        <ExcludeCtl value={st.excludeTop} onChange={(v) => set({ excludeTop: v })} />
      </div>
      <div className="strip">
        <div className="kpi"><span className="l">Segments tracked</span><span className="v">6</span><span className="small muted">Synthetic signal set</span></div>
        <div className="kpi"><span className="l">Companies tracked</span><span className="v">{new Set(ROUNDS.map((x) => x.company)).size}</span><span className="small muted">{ROUNDS.length} disclosed rounds</span></div>
        <div className="kpi"><span className="l">Open deals</span><span className="v">{openDeals}</span><span className="small muted">Across 2 funds</span></div>
        <div className="kpi"><span className="l">Diligence exceptions</span><span className="v" style={{ color: "var(--risk)" }}>{exceptions}</span><span className="small muted">Contradictions or unverified figures</span></div>
      </div>
      <div className="grid g-main">
        <div className="panel">
          <div className="panel-head"><h2>Opportunity ranking</h2><button className="linkish" onClick={() => go("markets")}>Open radar →</button></div>
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Segment</th><th className="r">Inflection</th><th className="r">Adoption</th><th className="r">Funding</th><th className="r">Evidence</th></tr></thead>
            <tbody>{r.map((s) => (
              <tr key={s.id} className="click" onClick={() => { set({ seg: s.id }); go("markets"); }}>
                <td className="num">{s.rank}{s.rank !== s.baseRank && <span className="small" style={{ color: s.rank < s.baseRank ? "var(--ok)" : "var(--risk)", marginLeft: 4 }}>{s.rank < s.baseRank ? "▲" : "▼"}{Math.abs(s.rank - s.baseRank)}</span>}</td>
                <td><span className="row" style={{ gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: SEG_COLOR[s.id] }} />{s.name}</span></td>
                <td className="r num"><b>{s.index.toFixed(0)}</b></td><td className="r num">{s.adoption}</td><td className="r num">{s.funding.toFixed(0)}</td><td className="r num">{pct(s.coverage)}</td>
              </tr>))}</tbody>
          </table></div>
          <p className="small muted">Inflection index is a heuristic 0–100 composite, not a success probability. Evidence = share of components backed by observed data.</p>
        </div>
        <div className="panel">
          <h2>What changed this week</h2>
          <div className="stack">{CHANGES.map((c) => (
            <button key={c.text} className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => go(c.target)}>
              <span className="row between"><Tag s={c.kind === "Contradiction" ? "disputed" : c.kind === "Diligence" ? "assumption" : "company"}>{c.kind}</Tag><span className="small muted">{c.when}</span></span>
              <span>{c.text}</span>
            </button>))}</div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>Deals requiring review</h2><button className="linkish" onClick={() => go("pipeline")}>Open pipeline →</button></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Company</th><th>Round</th><th>Stage</th><th>Owner</th><th>Flag</th></tr></thead>
          <tbody>{st.deals.filter((d) => d.flag && d.stage !== "Closed / Passed").map((d) => (
            <tr key={d.id} className="click" onClick={() => { if (d.company === "HelioOps") { set({ mode: "vc" }); go("company"); } else if (d.company.startsWith("Crestline")) { set({ mode: "pe" }); go("underwriting"); } else go("pipeline"); }}>
              <td><b>{d.company}</b></td><td>{d.round}</td><td>{d.stage}</td><td>{d.owner}</td><td><Tag s="disputed">{d.flag}</Tag></td>
            </tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}

// ---------------- Opportunity Radar ----------------
export function Markets({ st, go, set }) {
  const r = radar(st.excludeTop);
  const sel = r.find((s) => s.id === st.seg) || r[0];
  const pts = r.map((s) => ({ id: s.id, x: s.adoption, y: s.index, r: 10 + s.tamMid * 1.7, color: SEG_COLOR[s.id], label: s.short, dashed: s.coverage < 0.7 }));
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Explore markets</div><h1>Opportunity Radar</h1>
          <p>Where is the industry going? Each segment is placed by observed adoption against its 90-day inflection index. Bubble size is the estimated addressable market; dashed outlines have under 70% evidence coverage.</p></div>
        <ExcludeCtl value={st.excludeTop} onChange={(v) => set({ excludeTop: v })} />
      </div>
      {st.excludeTop > 0 && (
        <div className="callout info"><div className="stack" style={{ gap: 4 }}>
          <b>Excluding the {st.excludeTop === 1 ? "largest round" : "5 largest rounds"} ({fmtM(ROUNDS.filter((x) => excludedRoundIds(st.excludeTop).has(x.id)).reduce((a, x) => a + x.amount, 0), 0)} of {fmtM(ROUNDS.reduce((a, x) => a + x.amount, 0), 0)} disclosed)</b>
          <span className="small">Funding momentum keeps its deal-count half and scales its dollar half by the share of dollars left. {r[0].name} now ranks #1{r[0].baseRank !== 1 ? `, up from #${r[0].baseRank}` : ""}.</span>
        </div></div>
      )}
      <div className="grid g-main">
        <div className="panel">
          <Scatter points={pts} xDomain={[35, 80]} yDomain={[65, 90]} xLabel="Commercial adoption (observed, 0–100)" yLabel="Inflection index (90-day)" selected={sel.id} onPick={(id) => set({ seg: id })}
            quad={{ x: 60, y: 77.5, tl: "Momentum ahead of adoption", tr: "Accelerating and adopted" }} />
          <p className="small muted">A segment can be high on funding and low on adoption. Robotics orchestration and agent security sit top-left: capital is arriving before paying customers.</p>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>{sel.name}</h2><Tag s="synthetic" /></div>
          <div className="row" style={{ gap: 18 }}>
            <div className="kpi"><span className="l">Inflection</span><span className="v">{sel.index.toFixed(0)}</span></div>
            <div className="kpi"><span className="l">Rank</span><span className="v">#{sel.rank}</span></div>
            <div className="kpi"><span className="l">Evidence</span><span className="v">{pct(sel.coverage)}</span></div>
          </div>
          <div className="stack">{COMPONENTS.map(([k, l]) => (
            <div key={k} className="stack" style={{ gap: 3 }}>
              <div className="row between small"><span>{l} <span className="muted">· {Math.round(INDEX_WEIGHTS[k] * 100)}%</span></span><span className="num">{sel[k].toFixed(0)}{k === "funding" && st.excludeTop > 0 && sel.fundingBase !== sel.funding && <span className="muted"> (was {sel.fundingBase})</span>}</span></div>
              <Bar v={sel[k]} color={SEG_COLOR[sel.id]} />
            </div>))}</div>
          <div className="stack" style={{ gap: 4 }}><span className="eyebrow">Why now</span><p>{sel.narrative}</p></div>
          <div className="stack" style={{ gap: 4 }}><span className="eyebrow" style={{ color: "var(--risk)" }}>Contrary evidence</span><p>{sel.contrary}</p></div>
          <div className="row">{sel.id === "po" ? <button className="btn primary" onClick={() => go("map")}>Open market map →</button> : <span className="small muted">Market map seeded for Physical Operations AI in this demo.</span>}
            <button className="btn" onClick={() => go("flows")}>Capital flows</button></div>
        </div>
      </div>
      {sel.id === "po" && (
        <div className="panel">
          <div className="panel-head"><h2>Technology inflection timeline · Physical Operations AI</h2><Tag s="synthetic">Synthetic events</Tag></div>
          <div className="table-wrap"><table><tbody>{PO_TIMELINE.map((e) => (
            <tr key={e.date}><td className="num muted" style={{ width: 90 }}>{e.date}</td><td style={{ width: 110 }}><Tag s="third">{e.kind}</Tag></td><td>{e.text}</td></tr>))}</tbody></table></div>
        </div>
      )}
    </div>
  );
}

// ---------------- Capital Flows ----------------
export function Flows({ st, set }) {
  const [metric, setMetric] = useState("usd");
  const [period, setPeriod] = useState("all");
  const [inv, setInv] = useState(null);
  const ex = excludedRoundIds(st.excludeTop);
  const qs = period === "all" ? QUARTERS : QUARTERS.slice(-2);
  const rounds = ROUNDS.filter((x) => qs.includes(x.q) && !ex.has(x.id));
  const data = qs.map((q) => ({ label: q, parts: SEGMENTS.map((s) => {
    const rr = rounds.filter((x) => x.q === q && x.seg === s.id);
    return { key: s.short, value: metric === "usd" ? rr.reduce((a, x) => a + x.amount, 0) : rr.length, color: SEG_COLOR[s.id] };
  }) }));
  const total = rounds.reduce((a, x) => a + x.amount, 0);
  const top5 = [...rounds].sort((a, b) => b.amount - a.amount).slice(0, 5).reduce((a, x) => a + x.amount, 0);
  const investors = INVESTORS.map((name) => {
    const rr = rounds.filter((x) => x.investors.includes(name));
    const segs = [...new Set(rr.map((x) => x.seg))];
    return { name, deals: rr.length, usd: rr.reduce((a, x) => a + x.amount, 0), segs, rr };
  }).sort((a, b) => b.deals - a.deals);
  const selInv = investors.find((i) => i.name === inv);
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Capital flows</div><h1>Where capital is moving</h1>
          <p>Disclosed round amounts by quarter and segment. Deal count and dollars are aggregated separately; a company tagged to two segments counts once, under its primary segment.</p></div>
        <div className="row">
          <div className="seg-ctl">{[["usd", "Dollars"], ["count", "Deal count"]].map(([v, l]) => <button key={v} className={metric === v ? "on" : ""} onClick={() => setMetric(v)}>{l}</button>)}</div>
          <div className="seg-ctl">{[["all", "5 quarters"], ["2q", "Last 2 quarters"]].map(([v, l]) => <button key={v} className={period === v ? "on" : ""} onClick={() => setPeriod(v)}>{l}</button>)}</div>
          <ExcludeCtl value={st.excludeTop} onChange={(v) => set({ excludeTop: v })} />
        </div>
      </div>
      <div className="strip">
        <div className="kpi"><span className="l">Disclosed capital</span><span className="v">{fmtM(total, 0)}</span><span className="small muted">{rounds.length} rounds in view</span></div>
        <div className="kpi"><span className="l">Top-5 round share</span><span className="v">{pct(total ? top5 / total : 0)}</span><span className="small muted">Concentration of dollars</span></div>
        <div className="kpi"><span className="l">Median round</span><span className="v">{fmtM([...rounds].sort((a, b) => a.amount - b.amount)[Math.floor(rounds.length / 2)]?.amount || 0, 0)}</span><span className="small muted">Robust to outliers</span></div>
        <div className="kpi"><span className="l">Disclosure coverage</span><span className="v">100%</span><span className="small muted">Synthetic set; live data varies</span></div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>{metric === "usd" ? "Disclosed dollars ($M)" : "Deal count"} by quarter</h2><Tag s="synthetic" /></div>
        <StackedBars data={data} format={(v) => (metric === "usd" ? (v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${Math.round(v)}M`) : Math.round(v))} />
        <Legend items={SEGMENTS.map((s) => ({ label: s.short, color: SEG_COLOR[s.id] }))} />
      </div>
      <div className="grid g2">
        <div className="panel">
          <div className="panel-head"><h2>Tracked investor cohort</h2><span className="small muted">Participation, not endorsement</span></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Investor</th><th className="r">Deals</th><th className="r">Rounds joined</th><th>Segments</th></tr></thead>
            <tbody>{investors.map((i) => (
              <tr key={i.name} className={"click" + (inv === i.name ? " sel" : "")} onClick={() => setInv(inv === i.name ? null : i.name)}>
                <td><b>{i.name}</b></td><td className="r num">{i.deals}</td><td className="r num">{fmtM(i.usd, 0)}</td>
                <td><span className="row" style={{ gap: 4 }}>{i.segs.map((s) => <i key={s} title={s} style={{ width: 9, height: 9, borderRadius: 2, background: SEG_COLOR[s] }} />)}</span></td>
              </tr>))}</tbody>
          </table></div>
        </div>
        <div className="panel">
          <h2>{selInv ? `${selInv.name} · investments` : "Select an investor"}</h2>
          {selInv ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Company</th><th>Round</th><th>Quarter</th><th className="r">Size</th><th>Source</th></tr></thead>
              <tbody>{selInv.rr.map((x) => <tr key={x.id}><td>{x.company}</td><td>{x.stage}</td><td className="num">{x.q}</td><td className="r num">{fmtM(x.amount, 0)}</td><td><Tag s="synthetic" /></td></tr>)}</tbody>
            </table></div>
          ) : <p className="muted">Click an investor to see every round they joined, with size, date and source. "Rounds joined" is total round size, not the investor's own check.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------- Market Map ----------------
export function MarketMap({ go }) {
  const [sel, setSel] = useState("HelioOps");
  const pts = PO_COMPANIES.map((c, i) => ({ id: c.name, x: c.maturity, y: c.growth, r: 14, color: c.name === "HelioOps" ? "var(--accent)" : "var(--c2)", label: c.name, dashed: !c.observed }));
  const c = PO_COMPANIES.find((x) => x.name === sel);
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="crumbs"><a href="#markets">Opportunity Radar</a> / <span>Physical Operations AI</span></div>
        <h1>Market map · Physical Operations AI</h1>
        <p>The segment modeled as sub-segments and companies. Solid markers use company-reported metrics; dashed markers are inferred from public signals.</p>
      </div></div>
      <div className="grid g-main">
        <div className="panel">
          <Scatter points={pts} xDomain={[30, 80]} yDomain={[45, 85]} xLabel="Execution maturity" yLabel="Growth proxy" selected={sel} onPick={setSel} height={340} />
        </div>
        <div className="panel">
          <span className="eyebrow">Segment tree</span>
          <div className="tree">
            <div style={{ "--d": 0 }}>Enterprise AI</div><div style={{ "--d": 1 }}>Physical Operations</div><div style={{ "--d": 2 }}><b>Field Service</b></div>
            {SEGMENTS[0].tree.map((t) => <div key={t} style={{ "--d": 3 }} className={c.sub === t ? "" : "muted"}>{c.sub === t ? "● " : "○ "}{t}</div>)}
          </div>
          <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div className="row between"><h2>{c.name}</h2><Tag s={c.observed ? "company" : "inferred"}>{c.observed ? "Observed" : "Inferred"}</Tag></div>
            <span className="small muted">{c.sub} · {c.customer}</span>
            <span className="small">Main risk: {c.risk}</span>
            {c.name === "HelioOps" ? <button className="btn primary" onClick={() => go("company")}>Open Company 360 →</button> : <span className="small muted">Full profile seeded for HelioOps in this demo.</span>}
          </div>
        </div>
      </div>
      <div className="panel">
        <h2>Competitive matrix</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Company</th><th>Sub-segment</th><th>Customer</th><th>Deployment</th><th>Pricing</th><th>Key risk</th><th>Basis</th></tr></thead>
          <tbody>{PO_COMPANIES.map((x) => (
            <tr key={x.name} className={"click" + (x.name === sel ? " sel" : "")} onClick={() => setSel(x.name)}>
              <td><b>{x.name}</b></td><td>{x.sub}</td><td>{x.customer}</td><td>{x.deploy}</td><td>{x.pricing}</td><td>{x.risk}</td><td><Tag s={x.observed ? "company" : "inferred"}>{x.observed ? "Observed" : "Inferred"}</Tag></td>
            </tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}

// ---------------- Thesis ----------------
export function Thesis({ st, set, fit }) {
  const t = st.thesis;
  const upd = (patch) => set({ thesis: { ...t, ...patch }, thesisVersion: st.thesisVersion + 1 });
  const num = (k, label, min, max, unit = "%") => (
    <div className="field" key={k}><label htmlFor={"th-" + k}><span>{label}</span><span className="num" style={{ color: "var(--ink)" }}>{t[k]}{unit}</span></label>
      <input id={"th-" + k} type="range" min={min} max={max} value={t[k]} onChange={(e) => upd({ [k]: Number(e.target.value) })} /></div>
  );
  const icon = { pass: ["●", "var(--ok)"], warn: ["●", "var(--warn)"], fail: ["●", "var(--risk)"], unknown: ["○", "var(--faint)"] };
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="eyebrow">Fund II thesis · version {st.thesisVersion}</div>
        <h1>AI for the physical economy</h1>
        <p>Field-service, industrial and energy operations are moving from paper and radio to AI-guided workflows. We back Series A–C platforms that own the technician's workflow, not point tools.</p>
      </div></div>
      <div className="grid g2">
        <div className="panel">
          <h2>Mandate criteria</h2>
          <div className="field"><label>Sectors in scope</label>
            <div className="row">{SEGMENTS.map((s) => (
              <label key={s.id} className="row small" style={{ gap: 5 }}><input type="checkbox" checked={t.sectors.includes(s.id)} onChange={(e) => upd({ sectors: e.target.checked ? [...t.sectors, s.id] : t.sectors.filter((x) => x !== s.id) })} />{s.short}</label>))}</div></div>
          <div className="field"><label>Stages</label>
            <div className="row">{["Series A", "Series B", "Series C"].map((s) => (
              <label key={s} className="row small" style={{ gap: 5 }}><input type="checkbox" checked={t.stages.includes(s)} onChange={(e) => upd({ stages: e.target.checked ? [...t.stages, s] : t.stages.filter((x) => x !== s) })} />{s}</label>))}</div></div>
          <div className="grid g2">
            {num("checkMin", "Min check ($M)", 2, 20, "")}{num("checkMax", "Max check ($M)", 5, 40, "")}
            {num("minGrowth", "Min ARR growth", 20, 200)}{num("minNrr", "Min NRR", 90, 130)}
            {num("maxConc", "Max largest-customer share", 10, 40)}{num("minRunway", "Min runway (months)", 6, 24, "")}
          </div>
          <div className="stack" style={{ gap: 4 }}><span className="eyebrow">What could falsify this thesis?</span>
            <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
              <li>Incumbent field-service platforms ship equivalent AI within 12 months (watch: 3 largest vendors' release notes).</li>
              <li>Paid deployments stay pilots: under 30% of tracked pilots convert to multi-year contracts.</li>
              <li>Deployment effort keeps blended gross margin below 65% at $10M ARR.</li>
            </ul></div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>HelioOps against this mandate</h2><span className="small muted">Updates as you edit</span></div>
          <div className="stack">{fit.map((f) => (
            <div key={f.id} className="row" style={{ alignItems: "flex-start", gap: 10, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <span style={{ color: icon[f.status][1], fontSize: 14 }}>{icon[f.status][0]}</span>
              <div className="stack" style={{ gap: 2 }}><b>{f.label}</b><span className="small muted">{f.detail}</span></div>
              <span style={{ marginLeft: "auto" }}><Tag s={{ pass: "calculated", warn: "assumption", fail: "disputed", unknown: "missing" }[f.status]}>{{ pass: "Fits", warn: "Check", fail: "Fails", unknown: "Unknown" }[f.status]}</Tag></span>
            </div>))}</div>
          <p className="small muted">Unknown criteria are shown as unknown, never as a pass. Try raising Min NRR to 115% or lowering the concentration cap to 20%.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------- Pipeline ----------------
export function Pipeline({ st, set, go, toast, conn }) {
  const [confirm, setConfirm] = useState(null);
  const move = (d, dir) => {
    const i = PIPELINE_STAGES.indexOf(d.stage) + dir;
    if (i < 0 || i >= PIPELINE_STAGES.length) return;
    if (PIPELINE_STAGES[i] === "IC" && d.flag && !confirm) { setConfirm(d.id); return; }
    const to = PIPELINE_STAGES[i], before = st.deals;
    set({ deals: st.deals.map((x) => (x.id === d.id ? { ...x, stage: to } : x)) });
    setConfirm(null);
    if (conn && conn.mode === "api") {
      api.moveDeal(d.id, to, "H. Kishore").then(() => toast(`${d.company} moved to ${to} · saved to Postgres`))
        .catch((e) => { set({ deals: before }); toast(`Not saved: ${e.message}`); });
    } else toast(`${d.company} moved to ${to}`);
  };
  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">Deal pipeline</div><h1>Pipeline</h1>
        <p>Every stage change is a human decision. Moving a deal with open flags into IC asks you to acknowledge the gaps first; scores never promote a deal on their own.</p></div></div>
      <div className="kanban">{PIPELINE_STAGES.map((stg) => (
        <div key={stg} className="col">
          <div className="row between"><span className="eyebrow">{stg}</span><span className="num small muted">{st.deals.filter((d) => d.stage === stg).length}</span></div>
          {st.deals.filter((d) => d.stage === stg).map((d) => (
            <div key={d.id} className="card">
              <span className="row between"><b>{d.company}</b><i style={{ width: 8, height: 8, borderRadius: 2, background: SEG_COLOR[d.seg] }} /></span>
              <span className="small muted">{d.round} · {d.owner}</span>
              {d.flag && <Tag s="disputed">{d.flag}</Tag>}
              {confirm === d.id ? (
                <div className="stack small" style={{ gap: 6 }}><span>Open flag: {d.flag}. Move to IC anyway?</span>
                  <div className="row"><button className="btn sm primary" onClick={() => move(d, 1)}>Acknowledge &amp; move</button><button className="btn sm" onClick={() => setConfirm(null)}>Cancel</button></div></div>
              ) : (
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn sm ghost" aria-label="Move back" disabled={stg === PIPELINE_STAGES[0]} onClick={() => move(d, -1)}>←</button>
                  <button className="btn sm ghost" aria-label="Move forward" disabled={stg === PIPELINE_STAGES[PIPELINE_STAGES.length - 1]} onClick={() => move(d, 1)}>→</button>
                  {(d.company === "HelioOps" || d.company.startsWith("Crestline")) && <button className="linkish small" style={{ marginLeft: "auto" }} onClick={() => { set({ mode: d.company === "HelioOps" ? "vc" : "pe", company: "helioops" }); go(d.company === "HelioOps" ? "company" : "underwriting"); }}>Open</button>}
                  {conn && conn.mode === "api" && d.slug && d.company !== "HelioOps" && !d.company.startsWith("Crestline") && <button className="linkish small" style={{ marginLeft: "auto" }} onClick={() => { set({ mode: "vc", company: d.slug }); go("company"); }}>Open</button>}
                </div>
              )}
            </div>))}
        </div>))}</div>
    </div>
  );
}
