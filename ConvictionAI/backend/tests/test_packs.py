"""Company pack tests: validation rules, import, and the profile Company 360 reads."""
import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.packs import validate

client = TestClient(app)
PACK = json.loads((Path(__file__).resolve().parents[2] / "packs" / "clearops.json").read_text())


@pytest.fixture(autouse=True)
def fresh_db():
    if client.get("/api/health").json()["status"] != "ok":
        pytest.skip("Postgres not reachable")
    client.post("/api/demo/reset")


def test_clearops_pack_is_valid():
    assert validate(PACK, {"po", "me", "as", "ha", "ir", "dc"}) == []


def test_validation_catches_unsourced_facts_and_invented_metrics():
    bad = copy.deepcopy(PACK)
    bad["claims"].append({"id": "co-x", "name": "ARR", "value": "$5M", "status": "company"})     # no source
    bad["claims"].append({"id": "co-y", "name": "NRR", "value": "120%", "status": "missing"})    # missing with a value
    bad["claims"].append({"id": "co-z", "name": "Foo", "value": "1", "status": "rumor", "source": "s1"})
    msgs = " ".join(validate(bad))
    assert "co-x" in msgs and "co-y" in msgs and "co-z" in msgs


def test_profile_shows_sources_gaps_and_conflicts():
    p = client.get("/api/accounts/clearops/profile").json()
    assert p["account"]["record_type"] == "Startup" and p["account"]["is_synthetic"] is False
    claims = {c["id"]: c for c in p["claims"]}
    assert claims["co-arr"]["status"] == "missing"
    assert claims["co-site-a"]["status"] == claims["co-site-b"]["status"] == "disputed"
    assert claims["co-raise"]["source_url"].startswith("https://www.munich-startup.de/")
    assert p["coverage"] == {"ok": 3, "total": 10, "pct": 0.3}
    assert p["funding_rounds"][0]["investors"] == ["Barkawi Group", "Hitachi Ventures", "Schoeller Group"]
    assert p["retention"] is None  # no customer rows on the public web
    assert p["opportunity"]["stage_name"] == "Identified"


def test_upload_pack_replaces_and_rejects_bad_files():
    changed = copy.deepcopy(PACK)
    changed["account"]["number_of_employees"] = 75
    r = client.post("/api/packs", files={"file": ("clearops.json", json.dumps(changed).encode(), "application/json")})
    assert r.status_code == 200 and r.json()["claims"] == len(PACK["claims"])
    assert client.get("/api/accounts/clearops").json()["number_of_employees"] == 75
    assert len([a for a in client.get("/api/accounts").json() if a["slug"] == "clearops"]) == 1
    assert client.post("/api/packs", files={"file": ("x.json", b"not json", "application/json")}).status_code == 422
    bad = copy.deepcopy(PACK); bad["claims"][0]["status"] = "rumor"
    assert client.post("/api/packs", files={"file": ("x.json", json.dumps(bad).encode(), "application/json")}).status_code == 422


def test_listing_for_company_360():
    slugs = [a["slug"] for a in client.get("/api/accounts", params={"with_evidence": "true"}).json()]
    assert slugs[:2] == ["helioops", "clearops"] and "parentsquare" in slugs  # synthetic first, then researched packs


def test_company_outside_tracked_segments_with_undisclosed_round():
    p = client.get("/api/accounts/parentsquare/profile").json()
    assert p["segments"] == [] and p["funding_rounds"][0]["amount_usd_m"] is None
    assert p["funding_rounds"][0]["investors"] == ["Serent Capital"]
    assert p["coverage"]["ok"] == 2 and p["opportunity"]["stage_name"] == "Identified"
    # Not in a tracked segment, so the Opportunity Radar is unchanged
    assert client.get("/api/segments").json()[0]["id"] == "as"
