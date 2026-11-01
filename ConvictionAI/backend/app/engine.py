"""Deterministic financial engine.

Every authoritative number comes from these pure functions. They never touch the
database or an LLM, so they are easy to test. Mirrors web/src/engine.js.
"""
from typing import Dict, Iterable, List, Optional

INDEX_WEIGHTS = {"adoption": 0.25, "funding": 0.15, "tech": 0.20, "talent": 0.10, "whitespace": 0.15, "catalysts": 0.15}


# ---------- SaaS retention ----------
def cohort_bridge(rows: Iterable[dict]) -> Dict[str, float]:
    """rows: [{opening, ending}] for opening-cohort customers ($K). New logos (opening 0) are excluded."""
    b = {"opening": 0.0, "churn": 0.0, "contraction": 0.0, "expansion": 0.0, "ending": 0.0}
    for r in rows:
        o, e = float(r["opening"]), float(r["ending"])
        if o <= 0:
            continue
        b["opening"] += o
        b["ending"] += e
        if e == 0:
            b["churn"] += o
        elif e < o:
            b["contraction"] += o - e
        else:
            b["expansion"] += e - o
    return b


def nrr(b: Dict[str, float]) -> Optional[float]:
    if not b["opening"]:
        return None
    return (b["opening"] - b["churn"] - b["contraction"] + b["expansion"]) / b["opening"]


def grr(b: Dict[str, float]) -> Optional[float]:
    if not b["opening"]:
        return None
    return min(1.0, (b["opening"] - b["churn"] - b["contraction"]) / b["opening"])


def arr_growth(current: float, prior: float) -> Optional[float]:
    return current / prior - 1 if prior else None


def runway_months(cash: float, monthly_burn: float) -> Optional[float]:
    return cash / monthly_burn if monthly_burn > 0 else None


# ---------- Market sizing ----------
def tam(buyers: float, spend: float) -> float:
    return buyers * spend


def som(customers: float, acv: float) -> float:
    return customers * acv


# ---------- VC returns ----------
def irr_single(moic: float, years: float) -> Optional[float]:
    if moic <= 0 or years <= 0:
        return None
    return moic ** (1 / years) - 1


def vc_scenario(exit_arr: float, exit_multiple: float, exit_ownership: float, investment: float, years: float, net_debt: float = 0) -> dict:
    ev = exit_arr * exit_multiple
    proceeds = (ev - net_debt) * exit_ownership
    moic = proceeds / investment
    return {"ev": ev, "proceeds": proceeds, "moic": moic, "irr": irr_single(moic, years)}


# ---------- Market inflection index (heuristic, not a forecast) ----------
def inflection_index(c: dict) -> float:
    return sum(w * float(c[k]) for k, w in INDEX_WEIGHTS.items())


def adjusted_funding(base: float, total_usd: float, remaining_usd: float) -> float:
    """Keep the deal-count half of the funding score; scale the dollar half by dollars left."""
    if not total_usd:
        return base
    return base * (0.5 + 0.5 * remaining_usd / total_usd)


def rank_segments(segments: List[dict], rounds: List[dict], exclude_top: int = 0) -> List[dict]:
    excluded = {r["id"] for r in sorted(rounds, key=lambda r: -float(r["amount"]))[:exclude_top]}
    out = []
    for s in segments:
        rs = [r for r in rounds if r["segment_id"] == s["id"]]
        total = sum(float(r["amount"]) for r in rs)
        remaining = sum(float(r["amount"]) for r in rs if r["id"] not in excluded)
        funding = adjusted_funding(float(s["funding"]), total, remaining)
        out.append({**s, "funding_adjusted": funding, "total_usd_m": total, "remaining_usd_m": remaining,
                    "deals": len(rs), "index": inflection_index({**s, "funding": funding})})
    out.sort(key=lambda s: -s["index"])
    for i, s in enumerate(out, 1):
        s["rank"] = i
    return out


# ---------- Buy-and-build: rank add-on acquisition candidates ----------
ADDON_WEIGHTS = {"product_gap": 0.30, "cross_sell": 0.20, "availability": 0.20, "integration": 0.15, "size_fit": 0.15}


def addon_score(scores: dict, weights: Optional[dict] = None) -> float:
    """Weighted average of 1-5 analyst scores, on a 0-100 scale. Weights are normalised, so any positive mix works."""
    w = weights or ADDON_WEIGHTS
    total = sum(w.values())
    if not total:
        return 0.0
    return sum(w[k] * float(scores[k]) for k in w) / total / 5 * 100


def rank_addons(targets: List[dict], weights: Optional[dict] = None) -> List[dict]:
    """Available targets ranked by score (ties by name); unavailable ones listed after, unscored."""
    out = []
    for t in targets:
        r = dict(t)
        r["score"] = addon_score(t["scores"], weights) if t.get("is_available", True) else None
        out.append(r)
    avail = sorted([t for t in out if t["score"] is not None], key=lambda t: (-t["score"], t["name"]))
    for i, t in enumerate(avail, start=1):
        t["rank"] = i
    return avail + [t for t in out if t["score"] is None]


# ---------- Exit readiness: what a buyer's diligence will ask for ----------
# (key, label, weight, claim-id pattern, what to prepare)
READINESS_ITEMS = [
    ("arr", "ARR: scale and quality", 3, r"-arr$", "ARR ledger by customer, reconciled to revenue"),
    ("growth", "Revenue growth trajectory", 2, r"-growth", "Three-year revenue bridge: new, expansion, churn"),
    ("nrr", "Net revenue retention (cohorts)", 3, r"-nrr$", "Customer-level ARR export so NRR can be recomputed"),
    ("grr", "Gross revenue retention", 2, r"-grr$", "Churn and downgrade log by customer"),
    ("gm", "Gross margin", 2, r"-gm$", "COGS breakdown, including messaging and hosting costs"),
    ("ebitda", "EBITDA and cash flow", 3, r"-burn$|-ebitda$", "Monthly P&L and cash flow, with adjustments listed"),
    ("conc", "Customer concentration", 1, r"-conc$", "Top-20 customers by ARR with renewal dates"),
    ("qoe", "Audited financials / Quality of Earnings", 3, r"-qoe$", "Sell-side Quality of Earnings report"),
    ("logo", "Customer (logo) retention", 1, r"logo-retention", "Definition, period and cohort of the retention figure"),
    ("market", "Market position and scale", 1, r"-reach$", "Independent market sizing and share estimate"),
    ("mgmt", "Management continuity", 2, r"-mgmt$", "Org chart, leadership tenure, retention plan post-sale"),
    ("mna", "M&A integration track record", 1, r"-acq-", "Integration results for each acquisition: retention, cross-sell"),
    ("ai", "AI and product roadmap", 1, r"-ai$", "Product roadmap and AI adoption metrics by district"),
]
READINESS_CREDIT = {"verified": 1.0, "calculated": 1.0, "third": 0.75, "company": 0.5,
                    "inferred": 0.25, "assumption": 0.25, "disputed": 0.25, "missing": 0.0}


def exit_readiness(claims: List[dict]) -> dict:
    """claims: [{id, status, ...}]. For each item the strongest matching claim counts. Unmatched items are gaps."""
    import re
    items, got, total = [], 0.0, 0
    for key, label, weight, pattern, prepare in READINESS_ITEMS:
        matches = [c for c in claims if re.search(pattern, c["id"])]
        best = max(matches, key=lambda c: READINESS_CREDIT.get(c["status"], 0.0), default=None)
        credit = READINESS_CREDIT.get(best["status"], 0.0) if best else 0.0
        level = "ready" if credit >= 0.75 else "partial" if credit > 0 else "gap"
        items.append({"key": key, "label": label, "weight": weight, "credit": credit, "level": level,
                      "claim": best, "prepare": prepare})
        got += weight * credit
        total += weight
    plan = sorted([i for i in items if i["level"] != "ready"], key=lambda i: (-i["weight"], i["credit"], i["label"]))
    return {"score": got / total * 100, "items": items, "plan": plan,
            "counts": {lv: sum(i["level"] == lv for i in items) for lv in ("ready", "partial", "gap")}}
