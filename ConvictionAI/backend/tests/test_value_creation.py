"""Buy-and-build screener and exit readiness: engine math and the API on Postgres.
Expected numbers match web/tests/engine.test.mjs so the browser and the server agree."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import engine
from app.main import app
from app.packs import validate

client = TestClient(app)
PS = json.loads((Path(__file__).resolve().parents[2] / "packs" / "parentsquare.json").read_text())
TARGETS = [{**t, "is_available": t.get("available", True)} for t in PS["addon_targets"]]


def test_addon_ranking_and_weights():
    r = engine.rank_addons(TARGETS)
    assert [(t["slug"], t["score"] and round(t["score"], 1)) for t in r] == [
        ("onflo", 75.0), ("edlio", 66.0), ("apptegy", 62.0), ("bloomz", 57.0), ("schoolstatus", 40.0), ("kevgroup", None)]
    heavy = engine.rank_addons(TARGETS, {**engine.ADDON_WEIGHTS, "availability": 0.6})
    order = [t["slug"] for t in heavy]
    assert order.index("bloomz") < order.index("apptegy")
    assert engine.addon_score({k: 5 for k in engine.ADDON_WEIGHTS}) == pytest.approx(100)
    assert engine.addon_score({k: 1 for k in engine.ADDON_WEIGHTS}) == pytest.approx(20)


def test_exit_readiness_from_public_evidence():
    r = engine.exit_readiness(PS["claims"])
    assert r["score"] == pytest.approx(17.0)
    assert r["counts"] == {"ready": 2, "partial": 4, "gap": 7}
    assert [i["key"] for i in r["plan"][:3]] == ["arr", "qoe", "ebitda"]
    # Once a data room proves the financials, readiness rises: the score is driven by evidence, not opinion
    proved = PS["claims"] + [{"id": f"parentsquare-{k}", "status": "verified"} for k in ("arr", "nrr", "grr", "gm", "burn", "conc", "qoe")]
    assert engine.exit_readiness(proved)["score"] > 80


def test_pack_rules_for_addon_targets():
    assert validate(PS, {"po", "me", "as", "ha", "ir", "dc"}) == []
    bad = json.loads(json.dumps(PS))
    bad["addon_targets"][0]["scores"]["product_gap"] = 7
    bad["addon_targets"][1]["facts"][0]["source"] = "nope"
    bad["addon_targets"][5]["unavailable_reason"] = ""
    msgs = " ".join(validate(bad))
    assert "ps-addon-onflo" in msgs and "ps-addon-edlio" in msgs and "ps-addon-kev" in msgs


@pytest.fixture
def db():
    if client.get("/api/health").json()["status"] != "ok":
        pytest.skip("Postgres not reachable")
    client.post("/api/demo/reset")


def test_addons_endpoint(db):
    r = client.post("/api/accounts/parentsquare/addons", json={}).json()
    assert r["platform"] == "ParentSquare"
    top = r["targets"][0]
    assert top["slug"] == "onflo" and top["rank"] == 1 and top["score"] == pytest.approx(75)
    assert all(f["source_url"] for f in top["facts"] if f["status"] != "missing")
    kev = r["targets"][-1]
    assert kev["slug"] == "kevgroup" and kev["score"] is None and "Five Arrows" in kev["unavailable_reason"]
    r2 = client.post("/api/accounts/parentsquare/addons", json={"availability": 0.6}).json()
    assert r2["weights"]["availability"] == 0.6
    assert client.post("/api/accounts/helioops/addons", json={}).status_code == 404


def test_exit_readiness_endpoint_and_targets_stay_out_of_company_360(db):
    e = client.get("/api/accounts/parentsquare/exit-readiness").json()
    assert e["score"] == pytest.approx(17.0) and e["rounds"][0]["investors"] == ["Serent Capital"]
    slugs = {a["slug"] for a in client.get("/api/accounts", params={"with_evidence": "true"}).json()}
    assert "parentsquare" in slugs and "onflo" not in slugs
