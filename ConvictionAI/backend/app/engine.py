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
