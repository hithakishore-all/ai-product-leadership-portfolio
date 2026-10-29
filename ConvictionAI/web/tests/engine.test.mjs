import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/engine.js";
import { COHORT_ROWS, SEGMENTS, ROUNDS } from "../src/data.js";

const near = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("cohort CSV reconstructs the PRD bridge", () => {
  const b = E.cohortBridge(COHORT_ROWS);
  assert.equal(b.opening, 3000);
  assert.equal(b.churn, 165);
  assert.equal(b.contraction, 135);
  assert.equal(b.expansion, 690);
});

test("NRR 113%, GRR 90%, +11pp vs 124% claim", () => {
  const b = E.cohortBridge(COHORT_ROWS);
  near(E.nrr(b), 1.13);
  near(E.grr(b), 0.9);
  near((1.24 - E.nrr(b)) * 100, 11);
});

test("the erroneous $4M opening cohort would give 109.75%", () => {
  near(E.nrr({ opening: 4, churn: 0.165, contraction: 0.135, expansion: 0.69 }), 1.0975);
});

test("ARR growth, runway, ownership", () => {
  near(E.arrGrowth(6.4, 3.0), 1.1333);
  near(E.runwayMonths(4.9, 0.35), 14);
  near(E.ownershipAtClose(14, 86), 0.1628);
  assert.equal(E.burnMultiple(4.2, 0), null);
});

test("TAM / SAM / SOM and sensitivity range", () => {
  near(E.tam(65000, 150000) / 1e9, 9.75);
  near(E.tam(18000, 150000) / 1e9, 2.7);
  near(E.som(250, 180000) / 1e6, 45);
  const g = E.somGrid([125, 250, 400], [120000, 180000, 240000]);
  near(g[0][0] / 1e6, 15);
  near(g[2][2] / 1e6, 96);
});

test("VC scenarios match PRD within 0.1pp", () => {
  const base = { exitOwnership: 0.12, investment: 14, years: 5 };
  const d = E.vcScenario({ ...base, exitArr: 18, exitMultiple: 3 });
  const m = E.vcScenario({ ...base, exitArr: 48, exitMultiple: 6 });
  const u = E.vcScenario({ ...base, exitArr: 85, exitMultiple: 9 });
  near(d.proceeds, 6.48); near(d.moic, 0.4629); near(d.irr, -0.143, 0.001);
  near(m.proceeds, 34.56); near(m.moic, 2.4686); near(m.irr, 0.198, 0.001);
  near(u.proceeds, 91.8); near(u.moic, 6.5571); near(u.irr, 0.457, 0.001);
});

test("inflection index reproduces seeded segment scores", () => {
  const expected = { po: 81, me: 76, as: 84, ha: 70, ir: 79, dc: 73 };
  for (const s of SEGMENTS) near(E.inflectionIndex(s), expected[s.id], 0.5);
});

test("multi-segment company is not double counted", () => {
  const total = ROUNDS.reduce((a, r) => a + r.amount, 0);
  const bySeg = SEGMENTS.reduce((a, s) => a + ROUNDS.filter((r) => r.seg === s.id).reduce((x, r) => x + r.amount, 0), 0);
  assert.equal(total, bySeg);
});

test("unknown dimensions reduce coverage, not score", () => {
  const q = E.qualification([{ weight: 50, score: 5 }, { weight: 50, score: null }]);
  assert.equal(q.score, 100);
  assert.equal(q.rubricCoverage, 0.5);
});

test("LBO: paying for unverified EBITDA lowers returns", () => {
  const p = { entryMultiple: 9, leverage: 4, rate: 0.09, growth: 0.06, cashConversion: 0.75, capex: 1.2, exitMultiple: 9, years: 5 };
  const clean = E.lbo({ ...p, priceEbitda: 9.4, operatingEbitda: 9.4 });
  const overpay = E.lbo({ ...p, priceEbitda: 11, operatingEbitda: 9.4 });
  assert.ok(overpay.irr < clean.irr);
  near(overpay.actualLeverage, 44 / 9.4);
});
