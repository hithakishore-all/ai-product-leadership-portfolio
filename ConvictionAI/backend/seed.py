"""Create the database (if missing), build the Salesforce-shaped schema, and load the synthetic demo data.

Run from the repo root:  python backend/seed.py
Safe to re-run: it drops and recreates every table.
"""
import json
import re
import sys
from pathlib import Path

import psycopg
from psycopg import sql

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.db import DATABASE_URL, ROOT, connect  # noqa: E402

FUNDS = [("f2", "Fund II · Growth", "Growth VC"), ("f4", "Fund IV · Buyout", "PE Buyout")]


def ensure_database() -> None:
    name = psycopg.conninfo.conninfo_to_dict(DATABASE_URL).get("dbname", "conviction_ai")
    admin = psycopg.conninfo.make_conninfo(DATABASE_URL, dbname="postgres")
    with psycopg.connect(admin, autocommit=True) as conn:
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone():
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
            print(f"created database {name}")


def slugify(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def amount_from(label: str):
    m = re.search(r"\$(\d+(?:\.\d+)?)M", label or "")
    return float(m.group(1)) if m else None


def seed() -> dict:
    data = json.loads((ROOT / "db" / "seed.json").read_text())
    helio, details = data["helio"], {c["name"]: c for c in data["marketMap"]}
    with connect() as conn:
        conn.execute((ROOT / "db" / "schema.sql").read_text())
        conn.cursor().executemany("INSERT INTO fund__c VALUES (%s, %s, %s)", FUNDS)

        for s in data["segments"]:
            conn.execute(
                """INSERT INTO segment__c (id, name, short_name, adoption, funding, tech, talent, whitespace, catalysts,
                   evidence_coverage, tam_mid_usd_b, narrative, contrary)
                   VALUES (%(id)s, %(name)s, %(short)s, %(adoption)s, %(funding)s, %(tech)s, %(talent)s, %(whitespace)s,
                   %(catalysts)s, %(coverage)s, %(tamMid)s, %(narrative)s, %(contrary)s)""", s)

        def add_account(name, record_type, **f):
            return conn.execute(
                """INSERT INTO account (slug, name, record_type, description, billing_city, number_of_employees,
                   company_stage, sub_segment) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (slugify(name), name, record_type, f.get("description"), f.get("billing_city"),
                 f.get("employees"), f.get("stage"), f.get("sub"))).fetchone()["id"]

        # Startup Accounts: every company that raised a round.
        acct = {}
        for r in data["rounds"]:
            name = r["company"]
            if name in acct:
                continue
            is_helio = name == helio["name"]
            acct[name] = add_account(name, "Startup",
                                     description=helio["tagline"] if is_helio else None,
                                     billing_city=helio["hq"] if is_helio else None,
                                     employees=helio["employees"] if is_helio else None,
                                     stage=helio["stage"] if is_helio else r["stage"],
                                     sub=details.get(name, {}).get("sub"))
            conn.execute("INSERT INTO account_segment__c VALUES (%s, %s, TRUE)", (acct[name], r["seg"]))
            if r.get("seg2"):
                conn.execute("INSERT INTO account_segment__c VALUES (%s, %s, FALSE)", (acct[name], r["seg2"]))

        # PE Target Account (no rounds) and Investor Accounts.
        acct["Crestline Field Systems"] = add_account("Crestline Field Systems", "PE Target", stage="Buyout",
                                                      description="Service-software and maintenance workflow provider")
        conn.execute("INSERT INTO account_segment__c VALUES (%s, 'po', TRUE)", (acct["Crestline Field Systems"],))
        for name in data["investors"]:
            acct[name] = add_account(name, "Investor")

        for f in helio["founders"]:
            conn.execute("INSERT INTO contact (account_id, name, title, domain_evidence, evidence_status) VALUES (%s,%s,%s,%s,%s)",
                         (acct[helio["name"]], f["name"], f["role"], f["evidence"], f["status"]))

        for r in data["rounds"]:
            conn.execute("INSERT INTO funding_round__c (id, account_id, segment_id, stage, quarter, amount_usd_m) VALUES (%s,%s,%s,%s,%s,%s)",
                         (r["id"], acct[r["company"]], r["seg"], r["stage"], r["q"], r["amount"]))
            for inv in r["investors"]:
                conn.execute("INSERT INTO round_participant__c VALUES (%s, %s)", (r["id"], acct[inv]))

        helio_id = acct[helio["name"]]
        docs = {}
        for d in data["documents"]:
            docs[d["id"]] = conn.execute("INSERT INTO content_document (account_id, title, file_type) VALUES (%s,%s,%s) RETURNING id",
                                         (helio_id, d["name"], d["type"])).fetchone()["id"]
        for c in data["claims"]:
            conn.execute("INSERT INTO evidence_claim__c (id, account_id, name, value_text, status, locator, is_critical) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                         (c["id"], helio_id, c["prop"], c["value"], c["status"], c["source"], c["critical"]))
        for i, r in enumerate(data["cohort"], start=2):
            conn.execute("INSERT INTO customer_arr__c (account_id, content_document_id, row_number, customer, opening_arr_k, ending_arr_k) "
                         "VALUES (%s,%s,%s,%s,%s,%s)", (helio_id, docs["cohort"], i, r["customer"], r["opening"], r["ending"]))

        for d in data["deals"]:
            pe = d["company"].startswith("Crestline")
            conn.execute("""INSERT INTO opportunity (id, account_id, fund_id, name, round_label, amount_usd_m, stage_name, owner_name, flag)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                         (d["id"], acct[d["company"]], "f4" if pe else "f2", f"{d['company']} · {d['round']}", d["round"],
                          amount_from(d["round"]), d["stage"], d["owner"], d["flag"]))
            conn.execute("INSERT INTO opportunity_field_history (opportunity_id, old_value, new_value, created_by) VALUES (%s, NULL, %s, 'seed')",
                         (d["id"], d["stage"]))

        # Real companies researched from the web: every pack in packs/ is imported on top of the demo data.
        from app.packs import import_pack
        for pack_file in sorted((ROOT / "packs").glob("*.json")):
            import_pack(conn, json.loads(pack_file.read_text()), pack_file.name)

        counts = {t: conn.execute(f"SELECT count(*) AS n FROM {t}").fetchone()["n"]
                  for t in ["account", "contact", "opportunity", "segment__c", "funding_round__c", "evidence_claim__c", "customer_arr__c"]}
    return counts


if __name__ == "__main__":
    ensure_database()
    print("loaded:", seed())
