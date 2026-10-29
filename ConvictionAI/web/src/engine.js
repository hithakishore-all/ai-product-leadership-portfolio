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
