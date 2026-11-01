"""API tests against a real Postgres. They reseed the database first.
Run: pytest   (needs DATABASE_URL pointing at a local Postgres)"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_db():
    if client.get("/api/health").json()["status"] != "ok":
        pytest.skip("Postgres not reachable; start it and run python backend/seed.py")
    client.post("/api/demo/reset")


def test_accounts_by_record_type():
    # 30 synthetic demo Accounts, plus ClearOps, its 3 investors and any other researched packs in packs/
    assert client.get("/api/health").json()["accounts"] >= 34
    rows = {t: client.get("/api/accounts", params={"record_type": t}).json() for t in ["Startup", "PE Target", "Investor"]}
    assert {t: sum(a["is_synthetic"] for a in r) for t, r in rows.items()} == {"Startup": 21, "PE Target": 1, "Investor": 8}
    assert "clearops" in {a["slug"] for a in rows["Startup"]}
    helio = client.get("/api/accounts/helioops").json()
    assert helio["record_type"] == "Startup" and len(helio["contacts"]) == 2


def test_retention_recomputed_from_customer_arr_rows():
    r = client.get("/api/accounts/helioops/retention").json()
    assert len(r["rows"]) == 16
    assert r["nrr"] == pytest.approx(1.13, abs=0.001)
    assert r["grr"] == pytest.approx(0.90, abs=0.001)
    assert r["claimed_nrr"] == pytest.approx(1.24)
    assert r["gap_pp"] == pytest.approx(11, abs=0.01)


def test_customer_arr_upload_replaces_rows_and_recomputes():
    csv = b"customer,opening_arr,ending_arr\nA,100,120\nB,100,0\n"
    r = client.post("/api/accounts/helioops/customer-arr", files={"file": ("mine.csv", csv, "text/csv")}).json()
    assert r["source_file"] == "mine.csv"
    assert r["nrr"] == pytest.approx(0.6)
    bad = client.post("/api/accounts/helioops/customer-arr", files={"file": ("bad.csv", b"a,b\n1,2\n", "text/csv")})
    assert bad.status_code == 422


def test_stage_change_writes_field_history():
    assert client.patch("/api/opportunities/d1", json={"stage_name": "Partner Review", "changed_by": "H. Kishore"}).status_code == 200
    opp = next(o for o in client.get("/api/opportunities").json() if o["id"] == "d1")
    assert opp["stage_name"] == "Partner Review" and opp["fund_name"] == "Fund II · Growth"
    hist = client.get("/api/opportunities/d1/history").json()
    assert hist[-1] | {"created_date": None} == {"field": "StageName", "old_value": "Diligence", "new_value": "Partner Review",
                                                "created_by": "H. Kishore", "created_date": None}
    assert client.patch("/api/opportunities/d1", json={"stage_name": "Nope"}).status_code == 422


def test_disputed_claim_keeps_value_when_resolved():
    claims = {c["id"]: c for c in client.get("/api/accounts/helioops/claims").json()}
    assert claims["cl-nrr-claim"]["status"] == "disputed"
    r = client.post("/api/claims/cl-nrr-claim/resolve", json={"resolution": "Deck included new-logo ARR", "reviewer": "HK"}).json()
    assert r["value_text"] == "124%" and r["status"] == "company"


def test_segments_ranking_changes_without_mega_rounds():
    assert client.get("/api/segments").json()[0]["id"] == "as"
    assert client.get("/api/segments?exclude_top=5").json()[0]["id"] == "po"


def test_funding_rounds_by_investor_and_returns():
    gb = client.get("/api/funding-rounds", params={"investor": "Granite Bay Capital"}).json()
    assert len(gb) == 5 and all("Granite Bay Capital" in r["investors"] for r in gb)
    base = next(s for s in client.post("/api/returns", json={}).json() if s["name"] == "Base")
    assert base["moic"] == pytest.approx(2.4686, abs=0.001)


def test_tasks_attach_to_opportunity():
    t = client.post("/api/opportunities/d1/tasks", json={"subject": "CFO: NRR bridge", "owner_name": "HK"}).json()
    assert t["status"] == "Open" and t["what_id"] == "d1"
    assert len(client.get("/api/opportunities/d1/tasks").json()) == 1
