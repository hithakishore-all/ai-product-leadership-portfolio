// Value creation: the buy-and-build add-on screener and exit readiness, for a sponsor-backed platform company.
// Live mode reads Postgres through the API (which ranks with engine.py); offline mode uses the bundled
// ParentSquare pack and the same math in engine.js. Both give the same numbers (tests lock this in).
import * as E from "./engine.js";
import { api } from "./api.js";
import { Tag, Num, Field, Bar, pct } from "./ui.jsx";
import PS from "../../packs/parentsquare.json";
const { useState, useEffect } = React;

const PLATFORM = "parentsquare";
const CRITERIA = [
  ["product_gap", "Product gap filled", "Adds a capability the platform doesn't have"],
  ["cross_sell", "Cross-sell", "New customers, or more to sell to existing ones"],
  ["availability", "Availability", "Owner likely to sell in the next 1–2 years"],
  ["integration", "Integration ease", "5 = easy to combine products, data and teams"],
  ["size_fit", "Size fit", "5 = a tuck-in the platform can afford"],
];
const READY_LABEL = { ready: "Ready", partial: "Partial", gap: "Gap" };
const READY_TAG = { ready: "verified", partial: "company", gap: "missing" };

// ---------- offline: shape the bundled pack like the API responses ----------
const SRC = Object.fromEntries(PS.sources.map((s) => [s.id, s]));
const locator = (s) => (s ? [s.publisher, s.published].filter(Boolean).join(" · ") : null);
function offlineTargets() {
  return PS.addon_targets.map((t) => {
    const facts = [
      ...(t.facts || []).map((f, i) => ({ id: `${t.slug}-f${i + 1}`, name: f.name, value_text: f.value, status: f.status, locator: locator(SRC[f.source]), source_url: SRC[f.source] && SRC[f.source].url })),
      ...(t.unknowns || []).map((u, i) => ({ id: `${t.slug}-u${i + 1}`, name: u, value_text: "—", status: "missing", note: "Not public" })),
    ];
    return { id: t.id, slug: t.slug, name: t.name, description: t.description, website: t.website, hq: t.hq, adds: t.adds, ownership: t.ownership,
      is_available: t.available !== false, unavailable_reason: t.unavailable_reason, rationale: t.rationale || {}, scores: t.scores || {}, facts,
      confidence: facts.length ? facts.filter((f) => f.status !== "missing").length / facts.length : 0 };
  });
}
const offlineClaims = () => PS.claims.map((c) => ({ id: c.id, name: c.name, value_text: c.value == null ? "—" : c.value, status: c.status, source_url: SRC[c.source] && SRC[c.source].url, source_title: SRC[c.source] && SRC[c.source].title, note: c.note }));
const claimById = (id) => PS.claims.find((c) => c.id === id);

function Head({ eyebrow, title, children, right }) {
  return (
    <div className="page-head">
      <div><div className="crumbs"><a href="#company">ParentSquare</a> / <span>{eyebrow}</span></div><h1>{title}</h1><p>{children}</p></div>
      {right}
    </div>
  );
}

// ---------- Add-on Screener ----------
export function AddonScreener({ st, set, go, toast, conn }) {
  const live = conn && conn.mode === "api";
  const w = st.addonWeights || E.ADDON_WEIGHTS;
  const setW = (p) => set({ addonWeights: { ...w, ...p } });
  const wTotal = Object.values(w).reduce((x, y) => x + y, 0) || 1;
  const [targets, setTargets] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!live) { setTargets(E.rankAddons(offlineTargets(), w)); return; }
    api.addons(PLATFORM, w).then((r) => setTargets(r.targets)).catch((x) => { setErr(x.message); setTargets(E.rankAddons(offlineTargets(), w)); });
  }, [live, JSON.stringify(w)]);
  if (!targets) return <div className="page"><p className="muted">Loading add-on candidates…</p></div>;
  const ranked = targets.filter((t) => t.score != null), out = targets.filter((t) => t.score == null);
  const top = ranked[0];
  const playbook = claimById("parentsquare-playbook");
  return (
    <div className="page">
      <Head eyebrow="Buy-and-build" title="Which add-ons make ParentSquare worth more at exit?"
        right={<button className="btn" onClick={() => set({ addonWeights: E.ADDON_WEIGHTS })}>Reset weights</button>}>
        Serent's playbook is accretive M&A, and ParentSquare has done it twice: Signal Kit (2020) and Remind (2023). This screen ranks the next candidates on five criteria. Facts are sourced; the 1–5 scores are analyst judgments, shown with their reasoning, so you can disagree with any of them.
      </Head>
      {err && <div className="callout warn small">Live ranking unavailable ({err}); showing the bundled pack.</div>}
      <div className="grid g4">
        <div className="panel"><Num label="Candidates screened" value={targets.length} sub={`${ranked.length} available · ${out.length} not`} src="Researched from public sources" /></div>
        <div className="panel"><Num label="Top candidate" value={top ? top.name.split(" (")[0] : "—"} status="assumption" sub={top ? `score ${top.score.toFixed(0)}/100` : null} src="Analyst scores × your weights" /></div>
        <div className="panel"><Num label="Platform add-ons to date" value="2" status="third" sub="Signal Kit 2020 · Remind 2023" src="EdSurge 2020 · Serent 2023" /></div>
        <div className="panel"><Num label="Sponsor" value="Serent" status="company" sub="since Aug 2021" src={playbook ? "“Accelerate Growth Through Accretive M&A”" : null} /></div>
      </div>
      <div className="grid g-main">
        <div className="panel">
          <div className="panel-head"><h2>Ranked candidates</h2><span className="small muted">Click a row for the reasoning and sources</span></div>
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Company</th><th>What it adds</th><th>Owner</th><th className="r">Score</th><th>Data</th></tr></thead>
            <tbody>{ranked.map((t) => (
              <React.Fragment key={t.id}>
                <tr className="click" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                  <td className="num">{t.rank}</td>
                  <td><b>{t.name}</b><br /><span className="small muted">{t.hq || "HQ not found"}</span></td>
                  <td className="small">{t.adds}</td>
                  <td className="small">{t.ownership}</td>
                  <td className="r" style={{ minWidth: 110 }}><div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "nowrap" }}><div style={{ width: 60 }}><Bar v={t.score} color={t.rank === 1 ? "var(--accent)" : "var(--c2)"} /></div><b className="num">{t.score.toFixed(0)}</b></div></td>
                  <td className="small num" title="Share of the facts we need that are sourced">{pct(t.confidence)}</td>
                </tr>
                {open === t.id && <tr><td colSpan={6} style={{ background: "var(--panel2)" }}><AddonDetail t={t} /></td></tr>}
              </React.Fragment>))}</tbody>
          </table></div>
          {out.map((t) => (
            <div key={t.id} className="callout info small" style={{ marginTop: 4 }}>
              <div className="stack" style={{ gap: 4, flex: "1 1 300px" }}>
                <span><b>{t.name}</b> · not a target · {t.adds}</span>
                <span>{t.unavailable_reason}</span>
                <span className="row" style={{ gap: 6 }}>{t.facts.filter((f) => f.source_url).map((f) => <a key={f.id} href={f.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{f.name}: {f.value_text}</a>)}</span>
              </div>
              <button className="btn sm" onClick={() => go("exit")}>See it as an exit comparable →</button>
            </div>))}
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <h2>What matters to you</h2>
            <span className="small muted">Weights are normalised. Move one and the ranking recomputes.</span>
            {CRITERIA.map(([k, l, help]) => (
              <div key={k} className="stack" style={{ gap: 2 }}>
                <Field id={`w-${k}`} label={l} value={w[k]} min={0} max={0.6} step={0.05} onChange={(v) => setW({ [k]: v })} suffix={(v) => `${Math.round((v / wTotal) * 100)}%`} />
                <span className="src">{help}</span>
              </div>))}
          </div>
          <div className="panel small">
            <b>How to read this</b>
            <span>Score = weighted average of the five 1–5 scores, on a 0–100 scale. <b>Data</b> is the share of the facts we need that are sourced: revenue is not public for any candidate, so every number here starts a conversation, not a deal.</span>
            <span className="muted">Before an approach: confirm ownership, revenue and customer overlap with ParentSquare's 42,000 schools.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddonDetail({ t }) {
  return (
    <div className="grid g2" style={{ padding: "6px 2px" }}>
      <div className="stack">
        <span className="eyebrow">Scores and reasoning (analyst judgment)</span>
        {CRITERIA.map(([k, l]) => (
          <div key={k} className="stack" style={{ gap: 2 }}>
            <div className="row between small"><span>{l}</span><span className="num"><b>{t.scores[k]}</b>/5</span></div>
            <Bar v={t.scores[k]} max={5} />
            <span className="small muted">{(t.rationale || {})[k]}</span>
          </div>))}
      </div>
      <div className="stack">
        <span className="eyebrow">Facts on file</span>
        <span className="small">{t.description}{t.website ? ` · ${t.website}` : ""}</span>
        <div className="table-wrap"><table>
          <tbody>{t.facts.map((f) => (
            <tr key={f.id}><td className="small">{f.name}</td><td className="small">{f.value_text}</td><td><Tag s={f.status} /></td>
              <td className="small" style={{ whiteSpace: "nowrap" }}>{f.source_url ? <a href={f.source_url} target="_blank" rel="noopener noreferrer" title={f.locator || ""} style={{ color: "var(--accent)" }}>source</a> : <span className="muted">{f.note || "Not public"}</span>}</td></tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}

// ---------- Exit Readiness ----------
const yearsBetween = (a, b) => (new Date(b) - new Date(a)) / (365.25 * 24 * 3600 * 1000);

export function ExitReadiness({ st, go, toast, conn }) {
  const live = conn && conn.mode === "api";
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const offline = () => ({ account: "ParentSquare", ...E.exitReadiness(offlineClaims()) });
    if (!live) { setR(offline()); return; }
    api.exitReadiness(PLATFORM).then(setR).catch((x) => { setErr(x.message); setR(offline()); });
  }, [live]);
  if (!r) return <div className="page"><p className="muted">Scoring exit readiness…</p></div>;
  const hold = yearsBetween("2021-08-03", "2026-09-30");          // Serent release date → demo as-of date
  const kevHold = yearsBetween("2018-09-01", "2025-02-26");       // Serent → Five Arrows
  const comp = claimById("parentsquare-comp-kev");
  const plan = `Sale-prep plan for ParentSquare (from public evidence, ${Math.round(r.score)}% ready):\n` +
    r.plan.map((i, n) => `${n + 1}. ${i.label} [${READY_LABEL[i.level]}]: ${i.prepare}`).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(plan); toast("Sale-prep plan copied"); } catch { toast("Copy blocked here"); } };
  return (
    <div className="page">
      <Head eyebrow="Exit readiness" title="Is ParentSquare ready for a sale process?"
        right={<button className="btn primary" onClick={copy}>Copy sale-prep plan</button>}>
        What a buyer's diligence will ask for, checked against the evidence on file. Built only from public sources, so the financial package scores as a gap, which is exactly the list a sponsor would have the company produce before going to market.
      </Head>
      {err && <div className="callout warn small">Live scoring unavailable ({err}); showing the bundled pack.</div>}
      <div className="grid g4">
        <div className="panel"><Num label="Readiness (public evidence)" value={`${Math.round(r.score)}%`} sub={`${r.counts.ready} ready · ${r.counts.partial} partial · ${r.counts.gap} gaps`} src="Weighted by what buyers weigh most" /></div>
        <div className="panel"><Num label="Serent holding period" value={`${hold.toFixed(1)} yrs`} status="calculated" sub="Aug 2021 → Sep 30, 2026" src="Business Wire, Aug 2021" /></div>
        <div className="panel"><Num label="Comparable: KEV Group" value={`${kevHold.toFixed(1)} yrs`} status="third" sub="Serent → Five Arrows, Feb 2025" src={comp ? "Business Wire, Feb 2025" : null} /></div>
        <div className="panel"><Num label="Growth story" value="444%" status="third" sub="3-yr revenue growth, 2021–24" src="Inc. 5000 2025 · No. 962" /></div>
      </div>
      <div className="callout info">
        <div className="stack" style={{ gap: 4, flex: "1 1 360px" }}>
          <span className="eyebrow" style={{ color: "var(--accent)" }}>Timing signal · inferred</span>
          <span>ParentSquare is {hold.toFixed(1)} years into Serent's hold. Serent's K-12 exit of KEV Group came after about {kevHold.toFixed(1)} years. A sale or recap in the next 12–24 months is plausible. This is an inference from public dates, not a fact.</span>
        </div>
        <button className="btn" onClick={() => go("addons")}>Add-ons that raise the exit value →</button>
      </div>
      <div className="grid g-main">
        <div className="panel">
          <div className="panel-head"><h2>Buyer diligence checklist</h2><span className="small muted">Strongest evidence on file for each item</span></div>
          <div className="table-wrap"><table>
            <thead><tr><th>What a buyer asks for</th><th className="r">Weight</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>{r.items.map((i) => (
              <tr key={i.key}>
                <td><b>{i.label}</b></td>
                <td className="r num">{i.weight}</td>
                <td><Tag s={READY_TAG[i.level]}>{READY_LABEL[i.level]}</Tag></td>
                <td className="small">{i.claim && i.claim.status !== "missing"
                  ? <>{i.claim.name ? `${i.claim.name}: ` : ""}{i.claim.value_text} <Tag s={i.claim.status} />{i.claim.source_url && <> · <a href={i.claim.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>source</a></>}</>
                  : <span className="muted">Not public</span>}</td>
              </tr>))}</tbody>
          </table></div>
          <span className="small muted">Credit: verified or calculated 100%, third-party 75%, company-reported 50%, inferred or disputed 25%, missing 0%. Ready ≥ 75%.</span>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Sale-prep plan</h2><span className="small muted">Biggest gaps first</span></div>
          <ol className="stack small" style={{ margin: 0, paddingLeft: 18 }}>
            {r.plan.map((i) => <li key={i.key}><b>{i.label}</b> <Tag s={READY_TAG[i.level]}>{READY_LABEL[i.level]}</Tag><br /><span className="muted">{i.prepare}</span></li>)}
          </ol>
          <span className="small">Once the company shares these, upload them as in the HelioOps data room: the engine recomputes NRR from customer rows and the score moves on evidence, not opinion.</span>
        </div>
      </div>
    </div>
  );
}
