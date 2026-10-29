"""Company packs: one JSON file per company with every fact, its source and its status.

validate(pack)          -> list of human-readable problems (empty = OK)
import_pack(conn, pack) -> summary dict; safe to re-run (replaces that company's records)

The pack format is documented in packs/README.md.
"""
import re
from typing import List

STATUSES = {"verified", "calculated", "company", "third", "inferred", "assumption", "missing", "disputed"}
STAGES = {"Identified", "Initial Screen", "Qualified", "Diligence", "Partner Review", "IC", "Closed / Passed"}
RECORD_TYPES = {"Startup", "PE Target", "Investor"}


def slugify(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def validate(pack: dict, segment_ids=None) -> List[str]:
    p = []
    if not isinstance(pack, dict):
        return ["The pack must be a JSON object."]
    if pack.get("pack_version") != "1.0":
        p.append("pack_version must be \"1.0\".")
    sources = {s.get("id"): s for s in pack.get("sources", []) if isinstance(s, dict)}
    for s in pack.get("sources", []):
        for k in ("id", "publisher", "url", "retrieved"):
            if not s.get(k):
                p.append(f"Source {s.get('id', '?')} is missing '{k}'.")
        if s.get("url") and not re.match(r"^https?://", s["url"]):
            p.append(f"Source {s.get('id')} url must start with http:// or https://.")
    a = pack.get("account") or {}
    if not a.get("name"):
        p.append("account.name is required.")
    if a.get("record_type", "Startup") not in RECORD_TYPES:
        p.append(f"account.record_type must be one of {sorted(RECORD_TYPES)}.")
    segs = a.get("segments") or []
    if sum(1 for s in segs if s.get("is_primary")) != 1:
        p.append("account.segments needs exactly one entry with is_primary: true.")
    if segment_ids is not None:
        for s in segs:
            if s.get("segment_id") not in segment_ids:
                p.append(f"Unknown segment_id '{s.get('segment_id')}'. Known: {sorted(segment_ids)}.")
    ids = set()
    for c in pack.get("claims", []):
        cid = c.get("id")
        if not cid:
            p.append("Every claim needs an id."); continue
        if cid in ids:
            p.append(f"Claim id '{cid}' is used twice.")
        ids.add(cid)
        if c.get("status") not in STATUSES:
            p.append(f"Claim {cid}: status must be one of {sorted(STATUSES)}.")
        if c.get("status") == "missing" and c.get("value") not in (None, "", "—"):
            p.append(f"Claim {cid}: a missing claim cannot have a value.")
        if c.get("status") not in ("missing", "assumption") and c.get("source") not in sources:
            p.append(f"Claim {cid}: every non-missing claim needs a source id from 'sources'.")
    for r in pack.get("funding_rounds", []):
        if not r.get("id") or not r.get("stage") or r.get("amount_usd_m") is None:
            p.append(f"Funding round {r.get('id', '?')} needs id, stage and amount_usd_m.")
        if r.get("source") not in sources:
            p.append(f"Funding round {r.get('id', '?')} needs a source id from 'sources'.")
    for row in pack.get("customer_arr", []):
        if row.get("opening") is None or row.get("ending") is None:
            p.append("Every customer_arr row needs opening and ending (in $K).")
    o = pack.get("opportunity")
    if o and o.get("stage_name") not in STAGES:
        p.append(f"opportunity.stage_name must be one of {sorted(STAGES)}.")
    return p


def import_pack(conn, pack: dict, file_name: str = "pack.json") -> dict:
    seg_ids = {r["id"] for r in conn.execute("SELECT id FROM segment__c").fetchall()}
    problems = validate(pack, seg_ids)
    if problems:
        raise ValueError("Pack is not valid:\n- " + "\n- ".join(problems))
    a = pack["account"]
    slug = a.get("slug") or slugify(a["name"])
    sources = {s["id"]: s for s in pack.get("sources", [])}

    # Replace this company's records if it was imported before (opportunity first: no cascade there).
    old = conn.execute("SELECT id FROM account WHERE slug = %s", (slug,)).fetchone()
    if old:
        conn.execute("DELETE FROM opportunity WHERE account_id = %s", (old["id"],))
        conn.execute("DELETE FROM account WHERE id = %s", (old["id"],))

    acct = conn.execute(
        """INSERT INTO account (slug, name, record_type, description, billing_city, billing_country, number_of_employees,
           company_stage, sub_segment, website, founded_year, is_synthetic)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (slug, a["name"], a.get("record_type", "Startup"), a.get("description"), a.get("billing_city"), a.get("billing_country"),
         a.get("number_of_employees"), a.get("company_stage"), a.get("sub_segment"), a.get("website"), a.get("founded_year"),
         bool(pack.get("is_synthetic", False)))).fetchone()["id"]
    for s in a["segments"]:
        conn.execute("INSERT INTO account_segment__c VALUES (%s, %s, %s)", (acct, s["segment_id"], bool(s.get("is_primary"))))

    doc = conn.execute("INSERT INTO content_document (account_id, title, file_type) VALUES (%s, %s, 'Company pack') RETURNING id",
                       (acct, file_name)).fetchone()["id"]

    for c in pack.get("contacts", []):
        conn.execute("INSERT INTO contact (account_id, name, title, domain_evidence, evidence_status) VALUES (%s,%s,%s,%s,%s)",
                     (acct, c["name"], c.get("title"), c.get("domain_evidence"), c.get("evidence_status", "third")))

    primary = next(s["segment_id"] for s in a["segments"] if s.get("is_primary"))
    for r in pack.get("funding_rounds", []):
        conn.execute("DELETE FROM funding_round__c WHERE id = %s", (r["id"],))
        conn.execute("INSERT INTO funding_round__c (id, account_id, segment_id, stage, quarter, amount_usd_m, source) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                     (r["id"], acct, r.get("segment_id", primary), r["stage"], r.get("quarter", r.get("announced", "")),
                      r["amount_usd_m"], sources[r["source"]]["url"]))
        for inv in r.get("investors", []):
            row = conn.execute("SELECT id FROM account WHERE name = %s", (inv["name"],)).fetchone()
            inv_id = row["id"] if row else conn.execute(
                "INSERT INTO account (slug, name, record_type, is_synthetic) VALUES (%s, %s, 'Investor', FALSE) RETURNING id",
                (slugify(inv["name"]), inv["name"])).fetchone()["id"]
            conn.execute("INSERT INTO round_participant__c VALUES (%s, %s) ON CONFLICT DO NOTHING", (r["id"], inv_id))

    for c in pack.get("claims", []):
        src = sources.get(c.get("source")) or {}
        locator = f"{src['publisher']} · {src.get('published', '')}".strip(" ·") if src else (c.get("note") or "Not public")
        conn.execute(
            """INSERT INTO evidence_claim__c (id, account_id, name, value_text, status, locator, is_critical, note,
               source_title, source_url, retrieved_date) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (id) DO UPDATE SET account_id = EXCLUDED.account_id""",
            (c["id"], acct, c["name"], c.get("value") if c.get("value") is not None else "—", c["status"], locator,
             bool(c.get("critical")), c.get("note"), src.get("title"), src.get("url"), src.get("retrieved")))

    for i, row in enumerate(pack.get("customer_arr", []), start=2):
        conn.execute("INSERT INTO customer_arr__c (account_id, content_document_id, row_number, customer, opening_arr_k, ending_arr_k) "
                     "VALUES (%s,%s,%s,%s,%s,%s)", (acct, doc, i, row.get("customer", f"Row {i}"), row["opening"], row["ending"]))

    o = pack.get("opportunity")
    if o:
        oid = o.get("id", slug)
        conn.execute("DELETE FROM opportunity WHERE id = %s", (oid,))
        conn.execute("""INSERT INTO opportunity (id, account_id, fund_id, name, round_label, amount_usd_m, stage_name, owner_name, flag)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                     (oid, acct, o.get("fund_id", "f2"), f"{a['name']} · {o.get('round_label', '')}".strip(" ·"), o.get("round_label"),
                      o.get("amount_usd_m"), o["stage_name"], o.get("owner_name"), o.get("flag")))
        conn.execute("INSERT INTO opportunity_field_history (opportunity_id, old_value, new_value, created_by) VALUES (%s, NULL, %s, 'pack import')",
                     (oid, o["stage_name"]))

    claims = pack.get("claims", [])
    return {"account": slug, "claims": len(claims), "sources": len(sources),
            "missing": sum(1 for c in claims if c["status"] == "missing"),
            "disputed": sum(1 for c in claims if c["status"] == "disputed"),
            "funding_rounds": len(pack.get("funding_rounds", [])), "opportunity": bool(o)}
