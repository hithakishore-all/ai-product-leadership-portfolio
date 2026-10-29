"""End-to-end test of the full stack: browser -> FastAPI -> Postgres.
Start the API first (uvicorn app.main:app --app-dir backend), then:
    python web/tests/e2e_live.py http://localhost:8000 <screenshot_dir>
Requires: pip install playwright && python -m playwright install chromium
"""
import json, sys, pathlib, urllib.request
from playwright.sync_api import sync_playwright

base, shots = sys.argv[1], pathlib.Path(sys.argv[2])
shots.mkdir(parents=True, exist_ok=True)
fails = []

def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok: fails.append(msg)

def api(path, method="GET"):
    req = urllib.request.Request(base + path, method=method)
    return json.loads(urllib.request.urlopen(req).read())

api("/api/demo/reset", "POST")
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + "/")
    pg.wait_for_selector("text=Live · Postgres via API", timeout=8000)
    check(True, "UI reports live Postgres connection")
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector("text=Live · Postgres via API")
    # Data room loads rows from Postgres
    pg.click("nav >> text=Company 360"); pg.click("text=Load synthetic HelioOps data room")
    pg.wait_for_selector("text=Loaded 16 cohort rows from Postgres", timeout=8000)
    check(pg.locator("text=+11.0 pp").count() == 1, "NRR gap +11.0pp computed from Postgres rows")
    pg.screenshot(path=str(shots / "live-company.png"))
    # Upload a CSV -> stored in Postgres
    pg.click("text=Cohort data")
    pg.set_input_files("#csv2", files=[{"name": "mine.csv", "mimeType": "text/csv", "buffer": b"customer,opening_arr,ending_arr\nA,100,130\nB,100,90\n"}])
    pg.wait_for_selector("text=Saved 2 rows to Postgres", timeout=8000)
    r = api("/api/accounts/helioops/retention")
    check(len(r["rows"]) == 2 and abs(r["nrr"] - 1.10) < 1e-6, "uploaded CSV persisted; API NRR 110%")
    # Pipeline move persists with audit trail
    pg.click("nav >> text=Deal Pipeline")
    card = pg.locator(".card", has_text="Tracewell")
    card.locator("[aria-label='Move forward']").click()
    pg.wait_for_selector("text=saved to Postgres", timeout=8000)
    d = next(x for x in api("/api/opportunities") if x["id"] == "d3")
    check(d["stage_name"] == "Diligence", f"deal stage persisted in Postgres (got {d['stage_name']})")
    check(api("/api/opportunities/d3/history")[-1]["created_by"] == "H. Kishore", "stage change recorded in audit trail")
    # Reload: state comes back from the database
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_selector("text=Live · Postgres via API")
    pg.click("nav >> text=Deal Pipeline")
    check(pg.locator(".col", has_text="Diligence").locator("text=Tracewell").count() == 1, "after reload, pipeline read back from Postgres")
    pg.screenshot(path=str(shots / "live-pipeline.png"))
    # Reset reseeds the database
    pg.click("text=Reset demo"); pg.wait_for_selector("text=Postgres reseeded", timeout=8000)
    check(next(x for x in api("/api/opportunities") if x["id"] == "d3")["stage_name"] == "Qualified", "Reset demo reseeds Postgres")
    check(not errs, f"no page errors {errs}")
    b.close()
print("\nALL PASSED" if not fails else f"\n{len(fails)} FAILED"); sys.exit(1 if fails else 0)
