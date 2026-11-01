// Conviction AI — deterministic financial engine.
// Every authoritative number in the app comes from these pure functions.
// The language model (when connected) may explain results but never computes them.

export const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

// ---------- SaaS metrics ----------
export function cohortBridge(rows) {
  // rows: [{customer, opening, ending}] in $K, opening-cohort customers only
  let opening = 0, churn = 0, contraction = 0, expansion = 0, ending = 0;
  for (const r of rows) {
    const o = Number(r.opening) || 0, e = Number(r.ending) || 0;
    if (o <= 0) continue; // new logos are excluded from NRR by definition
    opening += o; ending += e;
    if (e === 0) churn += o;
    else if (e < o) contraction += o - e;
    else expansion += e - o;
  }
  return { opening, churn, contraction, expansion, ending };
}

export function nrr({ opening, churn, contraction, expansion }) {
  if (!opening) return null;
  return (opening - churn - contraction + expansion) / opening;
}

export function grr({ opening, churn, contraction }) {
  if (!opening) return null;
  return Math.min(1, (opening - churn - contraction) / opening);
}

export const arrGrowth = (current, prior) => (prior ? current / prior - 1 : null);
export const runwayMonths = (cash, monthlyBurn) => (monthlyBurn > 0 ? cash / monthlyBurn : null);
export function burnMultiple(netBurn, netNewArr) {
  return netNewArr > 0 ? netBurn / netNewArr : null; // meaningless when net-new ARR <= 0
}

// ---------- Market sizing ----------
export const tam = (universe, spend) => universe * spend;
export const som = (customers, acv) => customers * acv;
export function somGrid(customersList, acvList) {
  return customersList.map((c) => acvList.map((a) => som(c, a)));
}

// ---------- VC returns ----------
export const ownershipAtClose = (investment, postMoney) => investment / postMoney;

export function irrSingle(moic, years) {
  if (moic <= 0 || years <= 0) return null;
  return moic ** (1 / years) - 1;
}

export function vcScenario({ exitArr, exitMultiple, exitOwnership, investment, years, netDebt = 0 }) {
  const ev = exitArr * exitMultiple;
  const equity = ev - netDebt;
  const proceeds = equity * exitOwnership;
  const moic = proceeds / investment;
  return { ev, equity, proceeds, moic, irr: irrSingle(moic, years) };
}

// ---------- Market inflection index (heuristic, not a forecast) ----------
export const INDEX_WEIGHTS = { adoption: 0.25, funding: 0.15, tech: 0.2, talent: 0.1, whitespace: 0.15, catalysts: 0.15 };

export function inflectionIndex(c) {
  return Object.entries(INDEX_WEIGHTS).reduce((s, [k, w]) => s + w * c[k], 0);
}

// Funding momentum = 50% deal-count component (unchanged) + 50% dollar component,
// scaled by the share of disclosed dollars that remain after excluding mega-rounds.
export function adjustedFunding(baseScore, totalUsd, remainingUsd) {
  if (!totalUsd) return baseScore;
  return baseScore * (0.5 + 0.5 * (remainingUsd / totalUsd));
}

// ---------- Qualification score ----------
// dims: [{weight, score|null}] score 1-5. Unknown never silently counts.
export function qualification(dims) {
  const evaluated = dims.filter((d) => d.score != null);
  const known = evaluated.reduce((s, d) => s + d.weight, 0);
  const total = dims.reduce((s, d) => s + d.weight, 0);
  const pts = evaluated.reduce((s, d) => s + d.weight * (d.score / 5), 0);
  return { score: known ? (pts / known) * 100 : null, rubricCoverage: total ? known / total : 0 };
}

// ---------- PE LBO-lite ----------
export function lbo({ priceEbitda, operatingEbitda, entryMultiple, leverage, rate, growth, cashConversion, capex, exitMultiple, years }) {
  const ev = entryMultiple * priceEbitda;
  const debt0 = leverage * priceEbitda;
  const equity0 = ev - debt0;
  let debt = debt0, ebitda = operatingEbitda;
  const schedule = [];
  for (let y = 1; y <= years; y++) {
    ebitda = ebitda * (1 + growth);
    const interest = debt * rate;
    const cash = ebitda * cashConversion - capex - interest;
    const paydown = Math.min(Math.max(cash, 0), debt);
    debt = debt - paydown + Math.max(-cash, 0); // shortfalls are funded by revolver draw
    schedule.push({ year: y, ebitda, interest, cash, paydown, debt });
  }
  const exitEv = exitMultiple * ebitda;
  const exitEquity = exitEv - debt;
  const moic = exitEquity / equity0;
  return {
    ev, debt0, equity0, schedule, exitEv, exitEquity, moic,
    irr: irrSingle(moic, years),
    actualLeverage: debt0 / operatingEbitda,
    interestCoverY1: schedule[0] ? schedule[0].ebitda / schedule[0].interest : null,
  };
}

// ---------- Buy-and-build: rank add-on acquisition candidates (mirrors engine.py) ----------
export const ADDON_WEIGHTS = { product_gap: 0.3, cross_sell: 0.2, availability: 0.2, integration: 0.15, size_fit: 0.15 };

export function addonScore(scores, weights = ADDON_WEIGHTS) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return Object.entries(weights).reduce((s, [k, w]) => s + w * Number(scores[k]), 0) / total / 5 * 100;
}

export function rankAddons(targets, weights = ADDON_WEIGHTS) {
  const out = targets.map((t) => ({ ...t, score: t.is_available === false ? null : addonScore(t.scores, weights) }));
  const avail = out.filter((t) => t.score != null).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  avail.forEach((t, i) => { t.rank = i + 1; });
  return [...avail, ...out.filter((t) => t.score == null)];
}

// ---------- Exit readiness: what a buyer's diligence will ask for (mirrors engine.py) ----------
export const READINESS_ITEMS = [
  ["arr", "ARR: scale and quality", 3, /-arr$/, "ARR ledger by customer, reconciled to revenue"],
  ["growth", "Revenue growth trajectory", 2, /-growth/, "Three-year revenue bridge: new, expansion, churn"],
  ["nrr", "Net revenue retention (cohorts)", 3, /-nrr$/, "Customer-level ARR export so NRR can be recomputed"],
  ["grr", "Gross revenue retention", 2, /-grr$/, "Churn and downgrade log by customer"],
  ["gm", "Gross margin", 2, /-gm$/, "COGS breakdown, including messaging and hosting costs"],
  ["ebitda", "EBITDA and cash flow", 3, /-burn$|-ebitda$/, "Monthly P&L and cash flow, with adjustments listed"],
  ["conc", "Customer concentration", 1, /-conc$/, "Top-20 customers by ARR with renewal dates"],
  ["qoe", "Audited financials / Quality of Earnings", 3, /-qoe$/, "Sell-side Quality of Earnings report"],
  ["logo", "Customer (logo) retention", 1, /logo-retention/, "Definition, period and cohort of the retention figure"],
  ["market", "Market position and scale", 1, /-reach$/, "Independent market sizing and share estimate"],
  ["mgmt", "Management continuity", 2, /-mgmt$/, "Org chart, leadership tenure, retention plan post-sale"],
  ["mna", "M&A integration track record", 1, /-acq-/, "Integration results for each acquisition: retention, cross-sell"],
  ["ai", "AI and product roadmap", 1, /-ai$/, "Product roadmap and AI adoption metrics by district"],
];
export const READINESS_CREDIT = { verified: 1, calculated: 1, third: 0.75, company: 0.5, inferred: 0.25, assumption: 0.25, disputed: 0.25, missing: 0 };

export function exitReadiness(claims) {
  let got = 0, total = 0;
  const items = READINESS_ITEMS.map(([key, label, weight, pattern, prepare]) => {
    const matches = claims.filter((c) => pattern.test(c.id));
    const best = matches.reduce((b, c) => (b == null || (READINESS_CREDIT[c.status] || 0) > (READINESS_CREDIT[b.status] || 0) ? c : b), null);
    const credit = best ? READINESS_CREDIT[best.status] || 0 : 0;
    const level = credit >= 0.75 ? "ready" : credit > 0 ? "partial" : "gap";
    got += weight * credit; total += weight;
    return { key, label, weight, credit, level, claim: best, prepare };
  });
  const plan = items.filter((i) => i.level !== "ready").sort((a, b) => b.weight - a.weight || a.credit - b.credit || a.label.localeCompare(b.label));
  const counts = { ready: 0, partial: 0, gap: 0 }; items.forEach((i) => counts[i.level]++);
  return { score: (got / total) * 100, items, plan, counts };
}
