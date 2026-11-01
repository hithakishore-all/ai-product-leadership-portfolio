"""Conviction AI API. Endpoints are named after the Salesforce objects they serve.

Run from the repo root:
    uvicorn app.main:app --reload --app-dir backend
Then open http://localhost:8000 (the UI) or http://localhost:8000/docs (interactive API docs).
"""
import csv
import io
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

import json

import os
import threading
import uuid

from . import engine
from .packs import import_pack
from .db import ROOT, connect

STAGES = ["Identified", "Initial Screen", "Qualified", "Diligence", "Partner Review", "IC", "Closed / Passed"]

app = FastAPI(title="Conviction AI API", version="1.0.0",
              description="Salesforce-shaped data model on Postgres. Synthetic demo data. "
                          "Financial math is deterministic (app/engine.py).")


# ---------- helpers ----------
def account_or_404(conn, slug: str) -> dict:
    row = conn.execute("SELECT * FROM account WHERE slug = %s", (slug,)).fetchone()
    if not row:
        raise HTTPException(404, f"No account with slug '{slug}'")
    return row


def claimed_nrr(conn, account_id: int) -> Optional[float]:
    """The company's own NRR claim, read from its evidence record (e.g. '124%')."""
    row = conn.execute("SELECT value_text FROM evidence_claim__c WHERE account_id = %s AND id = 'cl-nrr-claim'",
                       (account_id,)).fetchone()
    try:
        return float(row["value_text"].strip().rstrip("%")) / 100 if row else None
    except (ValueError, AttributeError):
        return None


def retention_for(conn, account: dict) -> dict:
    rows = conn.execute(
        """SELECT r.row_number, r.customer, r.opening_arr_k::float AS opening, r.ending_arr_k::float AS ending, d.title
           FROM customer_arr__c r LEFT JOIN content_document d ON d.id = r.content_document_id
           WHERE r.account_id = %s ORDER BY r.row_number""", (account["id"],)).fetchall()
    b = engine.cohort_bridge(rows)
    n, g = engine.nrr(b), engine.grr(b)
    claimed = claimed_nrr(conn, account["id"])
    return {
        "account": account["slug"], "source_file": rows[0]["title"] if rows else None,
        "rows": [{"row": r["row_number"], "customer": r["customer"], "opening": r["opening"], "ending": r["ending"]} for r in rows],
        "bridge": b, "nrr": n, "grr": g, "claimed_nrr": claimed,
        "gap_pp": None if (n is None or claimed is None) else round((claimed - n) * 100, 2),
        "formula": "NRR = (opening - churn - contraction + expansion) / opening",
    }


# ---------- health ----------
@app.get("/api/health")
def health():
    try:
        with connect() as conn:
            n = conn.execute("SELECT count(*) AS n FROM account").fetchone()["n"]
        return {"status": "ok", "database": "postgres", "accounts": n}
    except Exception as e:  # report instead of crashing so the UI can fall back to offline mode
        return {"status": "degraded", "database": "unreachable", "error": str(e).splitlines()[0]}


# ---------- market intelligence (custom objects) ----------
@app.get("/api/segments")
def segments(exclude_top: int = 0):
    """Opportunity Radar ranking from segment__c. exclude_top removes the N largest rounds before scoring."""
    with connect() as conn:
        segs = conn.execute("SELECT * FROM segment__c").fetchall()
        rounds = conn.execute("SELECT id, segment_id, amount_usd_m::float AS amount FROM funding_round__c "
                              "WHERE segment_id IS NOT NULL AND amount_usd_m IS NOT NULL").fetchall()
    for s in segs:
        s["evidence_coverage"] = float(s["evidence_coverage"])
        s["tam_mid_usd_b"] = float(s["tam_mid_usd_b"]) if s["tam_mid_usd_b"] is not None else None
    return engine.rank_segments(segs, rounds, exclude_top)


@app.get("/api/funding-rounds")
def funding_rounds(segment: Optional[str] = None, investor: Optional[str] = None):
    """funding_round__c with participating investor Accounts."""
    q = """SELECT f.id, a.name AS account_name, f.segment_id, f.stage, f.quarter, f.amount_usd_m::float AS amount_usd_m,
                  f.source, array_agg(i.name ORDER BY i.name) AS investors
           FROM funding_round__c f JOIN account a ON a.id = f.account_id
           JOIN round_participant__c rp ON rp.round_id = f.id JOIN account i ON i.id = rp.investor_account_id
           WHERE (%(seg)s::text IS NULL OR f.segment_id = %(seg)s)
           GROUP BY f.id, a.name
           HAVING (%(inv)s::text IS NULL OR %(inv)s = ANY(array_agg(i.name)))
           ORDER BY f.quarter, f.id"""
    with connect() as conn:
        return conn.execute(q, {"seg": segment, "inv": investor}).fetchall()


# ---------- Accounts, Contacts and evidence ----------
@app.get("/api/accounts")
def accounts(record_type: Optional[str] = None, with_evidence: bool = False):
    """with_evidence=true lists only Accounts with critical evidence claims (the ones Company 360 can open).
    Add-on candidates have facts but no critical claims, so they appear in the Add-on Screener instead."""
    with connect() as conn:
        return conn.execute("""SELECT a.id, a.slug, a.name, a.record_type, a.company_stage, a.sub_segment, a.is_synthetic
                               FROM account a WHERE (%(rt)s::text IS NULL OR a.record_type = %(rt)s)
                               AND (NOT %(ev)s OR EXISTS (SELECT 1 FROM evidence_claim__c c WHERE c.account_id = a.id AND c.is_critical))
                               ORDER BY a.is_synthetic DESC, a.name""", {"rt": record_type, "ev": with_evidence}).fetchall()


@app.get("/api/accounts/{slug}")
def account(slug: str):
    with connect() as conn:
        a = account_or_404(conn, slug)
        a["segments"] = conn.execute("SELECT segment_id, is_primary FROM account_segment__c WHERE account_id = %s", (a["id"],)).fetchall()
        a["contacts"] = conn.execute("SELECT name, title, domain_evidence, evidence_status FROM contact WHERE account_id = %s ORDER BY id",
                                     (a["id"],)).fetchall()
        return a


@app.get("/api/accounts/{slug}/profile")
def profile(slug: str):
    """Everything Company 360 shows for one Account: fields, founders, funding, evidence with sources, coverage."""
    with connect() as conn:
        a = account_or_404(conn, slug)
        contacts = conn.execute("SELECT name, title, domain_evidence, evidence_status FROM contact WHERE account_id = %s ORDER BY id",
                                (a["id"],)).fetchall()
        rounds = conn.execute(
            """SELECT f.id, f.stage, f.quarter, f.amount_usd_m::float AS amount_usd_m, f.source,
                      coalesce(array_agg(i.name ORDER BY i.name) FILTER (WHERE i.name IS NOT NULL), '{}') AS investors
               FROM funding_round__c f LEFT JOIN round_participant__c rp ON rp.round_id = f.id
               LEFT JOIN account i ON i.id = rp.investor_account_id
               WHERE f.account_id = %s GROUP BY f.id ORDER BY f.quarter""", (a["id"],)).fetchall()
        claims = conn.execute(
            """SELECT id, name, value_text, status, locator, is_critical, note, source_title, source_url, retrieved_date, resolution
               FROM evidence_claim__c WHERE account_id = %s ORDER BY is_critical DESC, status = 'missing', id""", (a["id"],)).fetchall()
        segs = conn.execute("""SELECT s.id, s.name, x.is_primary FROM account_segment__c x JOIN segment__c s ON s.id = x.segment_id
                               WHERE x.account_id = %s ORDER BY x.is_primary DESC""", (a["id"],)).fetchall()
        opp = conn.execute("SELECT id, stage_name, round_label, flag, owner_name FROM opportunity WHERE account_id = %s", (a["id"],)).fetchone()
        has_rows = conn.execute("SELECT count(*) AS n FROM customer_arr__c WHERE account_id = %s", (a["id"],)).fetchone()["n"] > 0
        crit = [c for c in claims if c["is_critical"]]
        ok = [c for c in crit if c["status"] not in ("missing", "disputed")]
        return {"account": a, "segments": segs, "contacts": contacts, "funding_rounds": rounds, "claims": claims,
                "opportunity": opp, "retention": retention_for(conn, a) if has_rows else None,
                "coverage": {"ok": len(ok), "total": len(crit), "pct": (len(ok) / len(crit)) if crit else 0}}


@app.post("/api/packs")
async def upload_pack(file: UploadFile = File(...)):
    """Import a company pack (JSON). Validates first; re-importing the same company replaces its records."""
    try:
        pack = json.loads((await file.read()).decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HTTPException(422, f"Not valid JSON: {e}")
    try:
        with connect() as conn:
            return import_pack(conn, pack, file.filename or "pack.json")
    except ValueError as e:
        raise HTTPException(422, str(e))


# ---------- live research (needs ANTHROPIC_API_KEY) ----------
class ResearchIn(BaseModel):
    company: str
    hint: str = ""


JOBS: dict = {}


def research_client():
    """The Anthropic client, or None when no API key is configured. Tests replace this."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    import anthropic
    return anthropic.Anthropic()


def _run_job(job_id: str, company: str, hint: str, client) -> None:
    from .research import run_research
    job = JOBS[job_id]
    log = lambda m: job["events"].append(m)
    try:
        with connect() as conn:
            segments = conn.execute("SELECT id, name FROM segment__c ORDER BY id").fetchall()
        pack = run_research(company, client, segments, on_event=log, hint=hint)
        slug = pack["account"]["slug"]
        with connect() as conn:
            old = conn.execute("SELECT is_synthetic FROM account WHERE slug = %s", (slug,)).fetchone()
            if old and old["is_synthetic"]:
                raise RuntimeError(f"'{slug}' is a fictional demo company; refusing to overwrite it with research.")
            summary = import_pack(conn, pack, f"{slug}.json")
        (ROOT / "packs" / f"{slug}.json").write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n")
        log(f"Imported into Postgres and saved packs/{slug}.json")
        job.update(status="done", account=summary["account"], summary=summary)
    except Exception as e:  # report every failure to the UI rather than leaving the job running
        log(f"Stopped: {str(e).splitlines()[0]}")
        job.update(status="error", error=str(e))


@app.get("/api/research/status")
def research_status():
    """Whether live research is available (an API key is configured)."""
    return {"enabled": bool(os.environ.get("ANTHROPIC_API_KEY")), "model": os.environ.get("RESEARCH_MODEL", "claude-sonnet-5-5")}


@app.post("/api/research", status_code=202)
def start_research(body: ResearchIn):
    """Start a research agent for one company. Poll GET /api/research/{job_id} for progress."""
    company = body.company.strip()
    if not company or len(company) > 120:
        raise HTTPException(422, "Give a company name (up to 120 characters).")
    client = research_client()
    if client is None:
        raise HTTPException(503, "Live research needs ANTHROPIC_API_KEY in .env. Add it and restart make run.")
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"id": job_id, "company": company, "status": "running", "events": [], "account": None, "error": None}
    threading.Thread(target=_run_job, args=(job_id, company, body.hint.strip(), client), daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/research/{job_id}")
def research_job(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "No such research job")
    return JOBS[job_id]


# ---------- value creation: buy-and-build and exit readiness ----------
class AddonWeights(BaseModel):
    product_gap: float = engine.ADDON_WEIGHTS["product_gap"]
    cross_sell: float = engine.ADDON_WEIGHTS["cross_sell"]
    availability: float = engine.ADDON_WEIGHTS["availability"]
    integration: float = engine.ADDON_WEIGHTS["integration"]
    size_fit: float = engine.ADDON_WEIGHTS["size_fit"]


def addon_targets(conn, platform_id: int) -> List[dict]:
    rows = conn.execute(
        """SELECT x.*, t.slug, t.name, t.description, t.website, t.billing_city, t.billing_country
           FROM addon_target__c x JOIN account t ON t.id = x.target_account_id
           WHERE x.platform_account_id = %s ORDER BY t.name""", (platform_id,)).fetchall()
    out = []
    for r in rows:
        facts = conn.execute("""SELECT id, name, value_text, status, locator, note, source_title, source_url
                                FROM evidence_claim__c WHERE account_id = %s ORDER BY status = 'missing', id""",
                             (r["target_account_id"],)).fetchall()
        known = sum(f["status"] != "missing" for f in facts)
        out.append({"id": r["id"], "slug": r["slug"], "name": r["name"], "description": r["description"], "website": r["website"],
                    "hq": ", ".join(x for x in (r["billing_city"], r["billing_country"]) if x), "adds": r["adds"],
                    "ownership": r["ownership"], "is_available": r["is_available"], "unavailable_reason": r["unavailable_reason"],
                    "stage": r["stage"], "rationale": r["rationale"], "facts": facts,
                    "confidence": known / len(facts) if facts else 0,
                    "scores": {k: r[k] for k in engine.ADDON_WEIGHTS}})
    return out


@app.post("/api/accounts/{slug}/addons")
def rank_addons(slug: str, weights: AddonWeights = AddonWeights()):
    """Add-on acquisition candidates for a platform company, ranked by engine.rank_addons with the given weights."""
    with connect() as conn:
        a = account_or_404(conn, slug)
        targets = addon_targets(conn, a["id"])
    if not targets:
        raise HTTPException(404, f"No add-on candidates recorded for {slug}")
    return {"platform": a["name"], "weights": weights.model_dump(), "targets": engine.rank_addons(targets, weights.model_dump())}


@app.get("/api/accounts/{slug}/exit-readiness")
def exit_readiness(slug: str):
    """What a buyer's diligence will ask for, scored from the evidence on file. Gaps become the sale-prep plan."""
    with connect() as conn:
        a = account_or_404(conn, slug)
        claims = conn.execute("""SELECT id, name, value_text, status, source_title, source_url, note
                                 FROM evidence_claim__c WHERE account_id = %s""", (a["id"],)).fetchall()
        rounds = conn.execute("""SELECT f.stage, f.quarter, coalesce(array_agg(i.name) FILTER (WHERE i.name IS NOT NULL), '{}') AS investors
                                 FROM funding_round__c f LEFT JOIN round_participant__c rp ON rp.round_id = f.id
                                 LEFT JOIN account i ON i.id = rp.investor_account_id WHERE f.account_id = %s
                                 GROUP BY f.id ORDER BY f.quarter""", (a["id"],)).fetchall()
    return {"account": a["name"], "slug": a["slug"], "rounds": rounds, **engine.exit_readiness(claims)}


@app.get("/api/accounts/{slug}/claims")
def claims(slug: str):
    with connect() as conn:
        a = account_or_404(conn, slug)
        return conn.execute("SELECT id, name, value_text, status, locator, is_critical, resolution FROM evidence_claim__c "
                            "WHERE account_id = %s ORDER BY is_critical DESC, id", (a["id"],)).fetchall()


@app.get("/api/accounts/{slug}/retention")
def retention(slug: str):
    """NRR and GRR recomputed from customer_arr__c rows, compared with the company's claimed NRR."""
    with connect() as conn:
        return retention_for(conn, account_or_404(conn, slug))


@app.post("/api/accounts/{slug}/customer-arr")
async def upload_customer_arr(slug: str, file: UploadFile = File(...)):
    """Replace the opening cohort with an uploaded CSV (columns: customer, opening_arr, ending_arr)."""
    text = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    cols = {(h or "").strip().lower(): h for h in (reader.fieldnames or [])}
    oc = next((cols[k] for k in cols if k.startswith("opening")), None)
    ec = next((cols[k] for k in cols if k.startswith("ending")), None)
    cc = next((cols[k] for k in cols if k.startswith("customer")), None)
    if not oc or not ec:
        raise HTTPException(422, "Need columns named opening_arr and ending_arr (customer is optional).")
    parsed = []
    for i, r in enumerate(reader, start=2):
        try:
            parsed.append((i, (r.get(cc) if cc else None) or f"Row {i}", float(r[oc]), float(r[ec])))
        except (TypeError, ValueError):
            continue
    if not parsed:
        raise HTTPException(422, "No numeric opening/ending values found.")
    with connect() as conn:
        a = account_or_404(conn, slug)
        doc = conn.execute("INSERT INTO content_document (account_id, title, file_type) VALUES (%s, %s, 'Cohort export') RETURNING id",
                           (a["id"], file.filename or "upload.csv")).fetchone()
        conn.execute("DELETE FROM customer_arr__c WHERE account_id = %s", (a["id"],))
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO customer_arr__c (account_id, content_document_id, row_number, customer, opening_arr_k, ending_arr_k) "
                            "VALUES (%s, %s, %s, %s, %s, %s)", [(a["id"], doc["id"], *p) for p in parsed])
        return retention_for(conn, a)


class Resolution(BaseModel):
    resolution: str
    reviewer: str = "analyst"


@app.post("/api/claims/{claim_id}/resolve")
def resolve_claim(claim_id: str, body: Resolution):
    """A human reviewer resolves a disputed claim. The original value is kept; only status and resolution change."""
    with connect() as conn:
        row = conn.execute("UPDATE evidence_claim__c SET status = 'company', resolution = %s, last_modified_date = now() "
                           "WHERE id = %s RETURNING id, name, value_text, status, resolution",
                           (f"{body.resolution} ({body.reviewer})", claim_id)).fetchone()
        if not row:
            raise HTTPException(404, f"No claim '{claim_id}'")
        return row


# ---------- Opportunities (deals), history and tasks ----------
@app.get("/api/opportunities")
def opportunities(fund: Optional[str] = None):
    with connect() as conn:
        return conn.execute("""SELECT o.id, o.name, a.name AS account_name, a.slug AS account_slug, o.fund_id, f.name AS fund_name,
                                      o.round_label, o.amount_usd_m::float AS amount_usd_m, o.stage_name, o.owner_name, o.flag,
                                      s.segment_id, o.last_modified_date
                               FROM opportunity o JOIN account a ON a.id = o.account_id JOIN fund__c f ON f.id = o.fund_id
                               LEFT JOIN account_segment__c s ON s.account_id = a.id AND s.is_primary
                               WHERE (%(fund)s::text IS NULL OR o.fund_id = %(fund)s)
                               ORDER BY o.id""", {"fund": fund}).fetchall()


class StageChange(BaseModel):
    stage_name: str
    changed_by: str = "analyst"


@app.patch("/api/opportunities/{opp_id}")
def update_stage(opp_id: str, body: StageChange):
    if body.stage_name not in STAGES:
        raise HTTPException(422, f"stage_name must be one of {STAGES}")
    with connect() as conn:
        cur = conn.execute("SELECT stage_name FROM opportunity WHERE id = %s", (opp_id,)).fetchone()
        if not cur:
            raise HTTPException(404, f"No opportunity '{opp_id}'")
        conn.execute("UPDATE opportunity SET stage_name = %s, last_modified_date = now() WHERE id = %s", (body.stage_name, opp_id))
        conn.execute("INSERT INTO opportunity_field_history (opportunity_id, old_value, new_value, created_by) VALUES (%s, %s, %s, %s)",
                     (opp_id, cur["stage_name"], body.stage_name, body.changed_by))
        return {"id": opp_id, "old_value": cur["stage_name"], "new_value": body.stage_name}


@app.get("/api/opportunities/{opp_id}/history")
def opportunity_history(opp_id: str):
    with connect() as conn:
        return conn.execute("SELECT field, old_value, new_value, created_by, created_date FROM opportunity_field_history "
                            "WHERE opportunity_id = %s ORDER BY id", (opp_id,)).fetchall()


class TaskIn(BaseModel):
    subject: str
    owner_name: Optional[str] = None
    description: Optional[str] = None


@app.get("/api/opportunities/{opp_id}/tasks")
def list_tasks(opp_id: str):
    with connect() as conn:
        return conn.execute("SELECT * FROM task WHERE what_id = %s ORDER BY id", (opp_id,)).fetchall()


@app.post("/api/opportunities/{opp_id}/tasks", status_code=201)
def add_task(opp_id: str, body: TaskIn):
    with connect() as conn:
        return conn.execute("INSERT INTO task (what_id, subject, owner_name, description) VALUES (%s, %s, %s, %s) RETURNING *",
                            (opp_id, body.subject, body.owner_name, body.description)).fetchone()


# ---------- underwriting ----------
class Scenario(BaseModel):
    name: str
    exit_arr: float
    exit_multiple: float


class ReturnsIn(BaseModel):
    investment: float = 14
    exit_ownership: float = 0.12
    years: float = 5
    scenarios: List[Scenario] = [Scenario(name="Downside", exit_arr=18, exit_multiple=3),
                                 Scenario(name="Base", exit_arr=48, exit_multiple=6),
                                 Scenario(name="Upside", exit_arr=85, exit_multiple=9)]


@app.post("/api/returns")
def returns(body: ReturnsIn):
    return [{"name": s.name, **engine.vc_scenario(s.exit_arr, s.exit_multiple, body.exit_ownership, body.investment, body.years)}
            for s in body.scenarios]


# ---------- demo admin ----------
@app.post("/api/demo/reset")
def reset_demo():
    """Rebuild the schema and reload synthetic data. Demo convenience; remove before real use."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("seed", ROOT / "backend" / "seed.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return {"reset": True, "loaded": mod.seed()}


# ---------- the UI (the same single HTML file) ----------
WEB = ROOT / "web" / "dist" / "index.html"


@app.get("/", include_in_schema=False)
def index():
    if not WEB.exists():
        raise HTTPException(404, "UI not built yet. Run: make build")
    return FileResponse(WEB)
