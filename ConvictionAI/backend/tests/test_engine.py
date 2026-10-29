"""Financial engine tests. These lock in the PRD's numbers. Run: pytest backend/tests"""
import json
from pathlib import Path

import pytest

from app import engine as E

SEED = json.loads((Path(__file__).resolve().parents[2] / "db" / "seed.json").read_text())
approx = lambda x, tol=0.001: pytest.approx(x, abs=tol)  # noqa: E731


def test_cohort_bridge_matches_prd():
    b = E.cohort_bridge(SEED["cohort"])
    assert (b["opening"], b["churn"], b["contraction"], b["expansion"]) == (3000, 165, 135, 690)


def test_nrr_113_grr_90_gap_11pp():
    b = E.cohort_bridge(SEED["cohort"])
    assert E.nrr(b) == approx(1.13)
    assert E.grr(b) == approx(0.90)
    assert (1.24 - E.nrr(b)) * 100 == approx(11)


def test_wrong_4m_cohort_from_prd_section_14_gives_109_75():
    assert E.nrr({"opening": 4, "churn": 0.165, "contraction": 0.135, "expansion": 0.69}) == approx(1.0975)


def test_new_logos_are_excluded():
    assert E.cohort_bridge([{"opening": 0, "ending": 500}, {"opening": 100, "ending": 100}])["opening"] == 100


def test_growth_runway_market_size():
    assert E.arr_growth(6.4, 3.0) == approx(1.1333)
    assert E.runway_months(4.9, 0.35) == approx(14)
    assert E.tam(65000, 150000) / 1e9 == approx(9.75)
    assert E.som(250, 180000) / 1e6 == approx(45)


@pytest.mark.parametrize("arr,mult,moic,irr", [(18, 3, 0.4629, -0.143), (48, 6, 2.4686, 0.198), (85, 9, 6.5571, 0.457)])
def test_vc_scenarios(arr, mult, moic, irr):
    r = E.vc_scenario(arr, mult, 0.12, 14, 5)
    assert r["moic"] == approx(moic)
    assert r["irr"] == approx(irr)


def test_inflection_index_and_mega_round_exclusion():
    rounds = [{"id": r["id"], "segment_id": r["seg"], "amount": r["amount"]} for r in SEED["rounds"]]
    base = E.rank_segments(SEED["segments"], rounds, 0)
    assert [s["id"] for s in base[:2]] == ["as", "po"]
    ex5 = E.rank_segments(SEED["segments"], rounds, 5)
    assert ex5[0]["id"] == "po"
    assert next(s for s in ex5 if s["id"] == "as")["index"] == approx(78, 0.5)
