// Derived state: everything the screens show is computed here from fixtures + engine.
import * as E from "./engine.js";
import { SEGMENTS, ROUNDS, BASE_CLAIMS, HELIO } from "./data.js";

export function excludedRoundIds(n) {
  return new Set([...ROUNDS].sort((a, b) => b.amount - a.amount).slice(0, n).map((r) => r.id));
}

export function radar(excludeTop) {
  const ex = excludedRoundIds(excludeTop);
  const rows = SEGMENTS.map((s) => {
    const rs = ROUNDS.filter((r) => r.seg === s.id);
    const total = rs.reduce((a, r) => a + r.amount, 0);
    const remaining = rs.filter((r) => !ex.has(r.id)).reduce((a, r) => a + r.amount, 0);
    const funding = E.adjustedFunding(s.funding, total, remaining);
    const comp = { ...s, funding };
    return { ...s, fundingBase: s.funding, funding, total, remaining, deals: rs.length, index: E.inflectionIndex(comp), baseIndex: E.inflectionIndex(s), excludedHere: rs.filter((r) => ex.has(r.id)) };
  });
  const ranked = [...rows].sort((a, b) => b.index - a.index);
  ranked.forEach((r, i) => (r.rank = i + 1));
  const baseRank = [...rows].sort((a, b) => b.baseIndex - a.baseIndex).map((r) => r.id);
  ranked.forEach((r) => (r.baseRank = baseRank.indexOf(r.id) + 1));
  return ranked;
}

export function claimsFor(state) {
  if (!state.dataRoom) return BASE_CLAIMS.map((c) => (c.id === "cl-tam" ? c : { ...c, value: "—", status: "missing", source: "Awaiting data room" }));
  const b = E.cohortBridge(state.cohort.rows);
  const n = E.nrr(b), g = E.grr(b);
  return BASE_CLAIMS.map((c) => {
    if (c.id === "cl-nrr-calc") return { ...c, value: n == null ? "—" : `${(n * 100).toFixed(1)}%`, source: `${state.cohort.file} · ${state.cohort.rows.length} opening-cohort rows`, status: state.cohort.uploaded ? "calculated" : c.status };
    if (c.id === "cl-grr") return { ...c, value: g == null ? "—" : `${(g * 100).toFixed(1)}%`, source: `${state.cohort.file}` };
    if (c.id === "cl-nrr-claim" && state.nrrResolution) return { ...c, status: "company", value: "124% → resolved", source: `${c.source} · resolved: ${state.nrrResolution}` };
    if (state.received[c.id]) return { ...c, status: "company", value: "Provided", source: "Received from company · pending analyst review" };
    return c;
  });
}

export function helioMetrics(state) {
  const b = E.cohortBridge(state.cohort.rows);
  const n = E.nrr(b);
  return {
    bridge: b, nrr: n, grr: E.grr(b), gap: n == null ? null : (HELIO.claimedNrr - n) * 100,
    growth: E.arrGrowth(HELIO.arrNow, HELIO.arrPrior), runway: E.runwayMonths(HELIO.cash, HELIO.burn),
    ownership: E.ownershipAtClose(HELIO.raise, HELIO.postMoney), arrMultiple: HELIO.postMoney / HELIO.arrNow,
  };
}

export function coverage(claims) {
  const crit = claims.filter((c) => c.critical);
  const ok = crit.filter((c) => !["missing", "disputed"].includes(c.status)).length;
  return { ok, total: crit.length, pct: crit.length ? ok / crit.length : 0 };
}

export function thesisFit(thesis, m, state) {
  const nrrDisputed = !state.nrrResolution;
  const loaded = state.dataRoom;
  const res = [
    { id: "seg", label: "Sector in thesis", detail: "Physical Operations AI → Field Service", status: thesis.sectors.includes("po") ? "pass" : "fail" },
    { id: "stage", label: "Stage", detail: `Series B within ${thesis.stages.join(", ")}`, status: thesis.stages.includes("Series B") ? "pass" : "fail" },
    { id: "check", label: "Check size", detail: `$14M vs $${thesis.checkMin}–${thesis.checkMax}M range`, status: 14 >= thesis.checkMin && 14 <= thesis.checkMax ? "pass" : "fail" },
    { id: "growth", label: "ARR growth", detail: loaded ? `${pct0(m.growth)} vs min ${thesis.minGrowth}%` : "Awaiting data room", status: !loaded ? "unknown" : m.growth * 100 >= thesis.minGrowth ? "pass" : "fail" },
    { id: "nrr", label: "Net revenue retention", detail: loaded ? `${pct0(m.nrr)} recomputed (124% claimed) vs min ${thesis.minNrr}%` : "Awaiting data room", status: !loaded ? "unknown" : m.nrr * 100 < thesis.minNrr ? "fail" : nrrDisputed ? "warn" : "pass" },
    { id: "conc", label: "Largest customer", detail: loaded ? `21.5% of ARR vs max ${thesis.maxConc}%` : "Awaiting data room", status: !loaded ? "unknown" : 21.5 <= thesis.maxConc ? (21.5 > thesis.maxConc - 5 ? "warn" : "pass") : "fail" },
    { id: "runway", label: "Cash runway", detail: loaded ? `${m.runway.toFixed(0)} months vs min ${thesis.minRunway}` : "Awaiting data room", status: !loaded ? "unknown" : m.runway >= thesis.minRunway ? "pass" : "fail" },
  ];
  return res;
}
const pct0 = (x) => `${(x * 100).toFixed(0)}%`;

export function vcDecision(state, claims, fit) {
  const cov = coverage(claims);
  const blockers = [];
  if (!state.dataRoom) blockers.push("No company data room reviewed yet");
  if (state.dataRoom && !state.nrrResolution) blockers.push("NRR claim unreconciled: 124% claimed vs 113% recomputed");
  fit.filter((f) => f.status === "fail").forEach((f) => blockers.push(`Fails fund mandate: ${f.label}`));
  const missing = claims.filter((c) => c.critical && c.status === "missing").map((c) => c.prop);
  let rec, cls;
  if (!state.dataRoom || cov.pct < 0.65) { rec = "MORE DILIGENCE"; cls = "more"; }
  else if (fit.some((f) => f.status === "fail")) { rec = "PASS / WATCH"; cls = "stop"; }
  else if (blockers.length || cov.pct < 0.85) { rec = "ADVANCE WITH CONDITIONS"; cls = "cond"; }
  else if (!state.signedOff) { rec = "IC-READY — AWAITING REVIEWER SIGN-OFF"; cls = "cond"; }
  else { rec = "ADVANCE TO IC"; cls = "go"; }
  return { cov, blockers, missing, rec, cls };
}
