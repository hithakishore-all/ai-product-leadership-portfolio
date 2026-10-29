"""
Builds orbit/mock/fixtures.json: an offline snapshot of what GTM Orbit reads from Snowflake
(RANKED_QUEUE_V + ACCOUNT_CONTEXT_V) plus a pre-computed agent run for every account, produced by
the exact same RUN_ACTIVATION_FLOW code that is deployed in Snowflake (07_scripted_agents.sql).

Used by `ORBIT_MOCK=1 npm start` so the app works offline (no Snowflake), e.g. for rehearsals.
Inputs: salesforce/export/*.csv (real Salesforce IDs), snowflake/seed/*.csv, data/generate_data.py.
"""
import csv
import importlib.util
import json
import os
import re
from collections import defaultdict
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AS_OF = date(2026, 10, 23)
STALE_AFTER, LOOKBACK = 3, 90


def rows(path):
    with open(os.path.join(ROOT, path), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


spec = importlib.util.spec_from_file_location("gen", os.path.join(ROOT, "data", "generate_data.py"))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

acc = rows("salesforce/export/Account.csv")
con = rows("salesforce/export/Contact.csv")
opp = rows("salesforce/export/Opportunity.csv")
cas = rows("salesforce/export/Case.csv")
calls = {c["CALL_ID"]: c for c in rows("snowflake/seed/gong_calls.csv")}
hits = rows("snowflake/seed/gong_tracker_hits.csv")
usage = rows("snowflake/seed/product_usage_monthly.csv")
intent = rows("snowflake/seed/intent_signals_weekly.csv")
events = rows("snowflake/seed/critical_events.csv")
scores = {r["ACCOUNT_KEY"]: r for r in rows("snowflake/seed/priority_scores.csv")}
growth = {r["ACCOUNT_KEY"]: r["GROWTH_VECTOR"] for r in rows("snowflake/seed/growth_vector.csv")}
seqs = rows("snowflake/seed/sequences.csv")
region = {a["key"]: a["region"] for a in gen.ACCOUNTS}

key_of = {a["Id"]: a["AccountNumber"] for a in acc}
sf_of = {a["AccountNumber"]: a["Id"] for a in acc}


def d(s):
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


def role(title):
    if not title:
        return None
    t = " " + title + " "
    tl = t.lower()
    if any(x in t for x in (" IT ",)) or any(x in tl for x in ("technology", "architecture", "engineering")):
        return "technical_evaluator"
    if any(x in tl for x in ("finance", "financial", "controller", "cfo")):
        return "economic_buyer"
    if title.lower().startswith(("chief", "svp", "vp")) or "vice president" in tl:
        return "executive_sponsor"
    if any(x in tl for x in ("director", "head of", "manager", "lead")):
        return "champion"
    return None


def evidence(key):
    sfid = sf_of[key]
    ev = []
    for o in opp:
        if o["AccountId"] != sfid:
            continue
        closed = o["IsClosed"] == "true"
        if closed and d(o["CloseDate"]) < AS_OF - timedelta(days=365):
            continue
        ts = o["CloseDate"] + " 00:00:00" if closed else o["LastModifiedDate"][:19].replace("T", " ")
        ex = f"Opportunity · {o['Name']} · {o['StageName']} · ${int(float(o['Amount'])):,}"
        if o["NextStep"]:
            ex += f" · next step: {o['NextStep']}"
        ev.append({"ref_id": "SF-OPP-" + o["Id"], "source": "Salesforce", "ts": ts, "excerpt": ex, "url": None})
    for c in cas:
        if c["AccountId"] == sfid:
            ev.append({"ref_id": "SF-CASE-" + c["CaseNumber"], "source": "Salesforce",
                       "ts": c["LastModifiedDate"][:19].replace("T", " "),
                       "excerpt": f"Case · {c['Status']} · {c['Priority']} priority · {c['Subject']}", "url": None})
    grouped = defaultdict(list)
    for h in hits:
        cl = calls[h["CALL_ID"]]
        if cl["ACCOUNT_KEY"] == key and d(cl["CALL_DATE"]) >= AS_OF - timedelta(days=LOOKBACK):
            grouped[(h["CALL_ID"], h["UTTERANCE_NUM"])].append(h)
    for (cid, n), hs in grouped.items():
        cl = calls[cid]
        trk = ", ".join(sorted({h["TRACKER"] for h in hs}))
        ev.append({"ref_id": f"{cid}#{n}", "source": "Gong", "ts": cl["CALL_DATE"] + " 00:00:00",
                   "excerpt": f"Tracker: {trk} · {d(cl['CALL_DATE']).strftime('%b %d')} call · \"{hs[0]['SNIPPET']}\"",
                   "url": cl["CALL_URL"]})
    if not any(c["ACCOUNT_KEY"] == key and d(c["CALL_DATE"]) >= AS_OF - timedelta(days=LOOKBACK) for c in calls.values()):
        ev.append({"ref_id": "GONG-none", "source": "Gong", "ts": AS_OF.isoformat() + " 00:00:00",
                   "excerpt": f"No calls in the last {LOOKBACK} days (unknown, not negative)", "url": None})
    u = sorted([r for r in usage if r["ACCOUNT_KEY"] == key], key=lambda r: r["MONTH"])
    if u:
        last, prev = u[-1], u[-4] if len(u) >= 4 else None
        act, pur = int(last["SEATS_ACTIVE"]), int(last["SEATS_PURCHASED"])
        delta = act - int(prev["SEATS_ACTIVE"]) if prev else 0
        ev.append({"ref_id": "SNOW-USG-" + key[-4:], "source": "Snowflake", "ts": last["MONTH"] + " 00:00:00",
                   "excerpt": f"Seat usage at {round(100 * act / pur)}% of plan ({act} of {pur} seats), "
                              f"{'up' if delta >= 0 else 'down'} {abs(delta)} seats over 3 months", "url": None})
    by_topic = defaultdict(list)
    for r in intent:
        if r["ACCOUNT_KEY"] == key:
            by_topic[r["TOPIC"]].append(r)
    for topic, rs in by_topic.items():
        rs.sort(key=lambda r: r["WEEK_START"])
        last, prev = rs[-1], rs[-5] if len(rs) >= 5 else None
        ev.append({"ref_id": f"INTENT-{key[-4:]}-{topic.upper().replace(' ', '_')}", "source": "Intent",
                   "ts": last["WEEK_START"] + " 00:00:00",
                   "excerpt": f"Intent: \"{topic}\" at {last['INTENSITY']}/100, from {prev['INTENSITY'] if prev else '?'} four weeks earlier",
                   "url": None})
    for e in events:
        if e["ACCOUNT_KEY"] == key:
            ev.append({"ref_id": f"EVT-{key[-4:]}-{e['EVENT_DATE'].replace('-', '')}", "source": "Signals",
                       "ts": e["EVENT_DATE"] + " 00:00:00", "excerpt": f"{e['EVENT_TYPE']} · {e['DESCRIPTION']}", "url": None})
    ev.sort(key=lambda x: x["ts"], reverse=True)
    return ev


def readiness(key):
    sfid = sf_of[key]
    cs = [c for c in con if c["AccountId"] == sfid]
    permitted, covered, all_contacts = [], set(), []
    for c in cs:
        opted = c["HasOptedOutOfEmail"] == "true"
        ok = (not opted) and bool(c["Email"])
        r = role(c["Title"])
        name = (c["FirstName"] + " " + c["LastName"]).strip()
        all_contacts.append({"contact_id": c["Id"], "name": name, "title": c["Title"] or None, "email": c["Email"] or None,
                             "role_hypothesis": r, "opted_out": opted, "do_not_call": c["DoNotCall"] == "true",
                             "permitted": ok, "incomplete": not (c["Email"] and c["Title"])})
        if ok:
            permitted.append({"contact_id": c["Id"], "name": name, "title": c["Title"], "email": c["Email"], "role_hypothesis": r})
            if r:
                covered.add(r)
    roles = ["champion", "economic_buyer", "technical_evaluator", "executive_sponsor"]
    return {"roles_covered": len(covered), "roles_total": 4, "missing_roles": [r for r in roles if r not in covered],
            "contacts_total": len(cs), "contacts_permitted": len(permitted),
            "opted_out_count": sum(c["HasOptedOutOfEmail"] == "true" for c in cs),
            "incomplete_records": sum(not (c["Email"] and c["Title"]) for c in cs),
            "permitted_contacts": permitted}, all_contacts


contexts, queue, contacts_all = {}, [], {}
owner = {"id": acc[0]["OwnerId"], "name": acc[0]["Owner.Name"], "email": acc[0]["Owner.Email"]}
for a in acc:
    key = a["AccountNumber"]
    s = scores[key]
    score = float(s["PRIORITY_SCORE"]) if s["PRIORITY_SCORE"] else None
    age = (AS_OF - d(s["SCORED_AT"])).days if s["SCORED_AT"] else None
    fresh = "unscored" if score is None else ("stale" if age > STALE_AFTER else "fresh")
    rd, allc = readiness(key)
    contacts_all[key] = allc
    ctx = {
        "SALESFORCE_ACCOUNT_ID": a["Id"], "ACCOUNT_KEY": key, "ACCOUNT_NAME": a["Name"], "INDUSTRY": a["Industry"],
        "ACCOUNT_TYPE": a["Type"], "REGION": region[key], "OWNER_ID": a["OwnerId"], "OWNER_NAME": a["Owner.Name"],
        "OWNER_EMAIL": a["Owner.Email"], "PRIORITY_SCORE": score, "SCORE_VERSION": s["SCORE_VERSION"],
        "SCORED_AT": s["SCORED_AT"] or None, "SCORE_RATIONALE": s["SCORE_RATIONALE"],
        "FEATURE_STATUS": json.loads(s["FEATURE_STATUS"]), "SCORE_AGE_DAYS": age, "SCORE_FRESHNESS": fresh,
        "GROWTH_VECTOR": growth[key], "ALLOWED_SEQUENCES": [q["SEQUENCE_ID"] for q in seqs if q["GROWTH_VECTOR"] == growth[key]],
        "CONTACT_READINESS": rd, "EVIDENCE": evidence(key),
        "BILLING_CITY": a["BillingCity"], "BILLING_COUNTRY": a["BillingCountry"],
        "EMPLOYEES": int(a["NumberOfEmployees"]), "ANNUAL_REVENUE": int(float(a["AnnualRevenue"])),
    }
    contexts[key] = ctx
order = sorted(contexts.values(), key=lambda c: (c["PRIORITY_SCORE"] is None, -(c["PRIORITY_SCORE"] or 0)))
for i, c in enumerate(order, 1):
    queue.append({"QUEUE_RANK": i, **{k: c[k] for k in ("SALESFORCE_ACCOUNT_ID", "ACCOUNT_KEY", "ACCOUNT_NAME", "INDUSTRY",
                  "REGION", "OWNER_ID", "OWNER_EMAIL", "PRIORITY_SCORE", "SCORE_VERSION", "SCORE_FRESHNESS", "SCORE_AGE_DAYS",
                  "SCORE_RATIONALE", "FEATURE_STATUS", "GROWTH_VECTOR")},
                  "ROLES_COVERED": c["CONTACT_READINESS"]["roles_covered"], "MISSING_ROLES": c["CONTACT_READINESS"]["missing_roles"]})

# ---- run the deployed flow code against these contexts to get exact packages + events
sql = open(os.path.join(ROOT, "snowflake", "07_scripted_agents.sql"), encoding="utf-8").read()
body = re.search(r"\$\$\n(.*?)\$\$;", sql, re.S).group(1)
ns = {}
exec(body, ns)


def sql_rows(stmt, block):
    vals = re.findall(r"\('(GTM-\d{4})', (.*?)\)(?:,\n|;)", block, re.S)
    return vals


notes = {"GTM-0001": "I saw Northstar is expanding into three new regions this year.",
         "GTM-0002": "Congratulations on the Series C funding round.",
         "GTM-0003": "Since you're replacing your ERP next quarter, this seemed like a good time to reach out."}
ins = re.search(r"INSERT INTO GTM_DEMO\.APP\.SCRIPTED_DRAFTS VALUES\n(.*?);\n", sql, re.S).group(1)
scripts = {}
for m in re.finditer(r"\('(GTM-\d{4})', '(.*?)', '(.*?)', '(.*?)',\n '(.*?)',\n '(.*?)',\n '(.*?)',\n '(.*?)'\)", ins, re.S):
    k, last, pat, subj, hook, val, ask, why = [x.replace("''", "'") for x in m.groups()]
    scripts[k] = {"ACCOUNT_KEY": k, "PRIMARY_LAST_NAME": last, "HOOK_REF_PATTERN": pat, "SUBJECT": subj,
                  "HOOK_LINE": hook, "VALUE_LINE": val, "ASK_LINE": ask, "WHY_NOW": why}
assert len(scripts) == 9, len(scripts)


class Row(dict):
    def as_dict(self):
        return dict(self)


class Q:
    def __init__(self, s, q, p):
        self.s, self.q, self.p = s, q, p

    def collect(self):
        q, p, st = self.q, self.p or [], self.s
        if "FROM GTM_DEMO.APP.AGENT_CONFIG" in q:
            return [Row(KEY=k, VALUE=v) for k, v in {"MODEL": "scripted", "MAX_RETRIES": "2", "DEMO_MODE": "true",
                                                      "SENDER_NAME": "Alex", "SELLER": "Acme", "MAX_WORDS": "130",
                                                      "SCRIPTED_DELAY_MS": "0"}.items()]
        if "ACCOUNT_CONTEXT_V" in q:
            c = dict(contexts[st.key])
            for k in ("FEATURE_STATUS", "CONTACT_READINESS", "EVIDENCE", "ALLOWED_SEQUENCES"):
                c[k] = json.dumps(c[k])
            return [Row(c)]
        if "SCRIPTED_DRAFTS" in q:
            return [Row(scripts[st.key])] if st.key in scripts else []
        if "FROM GTM_DEMO.APP.AE_NOTES" in q:
            return [Row(NOTE="unverified", EMAIL_LINE=notes[st.key])] if st.key in notes else []
        if "INSERT INTO GTM_DEMO.APP.AUDIT_EVENTS" in q:
            st.events.append({"EVENT": p[1], "ACTOR": p[4], "DURATION_MS": int(p[5]) if p[5] not in ("", None) else None,
                              "DETAIL": json.loads(p[6]), "LEVEL": json.loads(p[6]).get("level")})
        return []


class Session:
    def __init__(self, key):
        self.key, self.events = key, []

    def sql(self, q, params=None):
        return Q(self, q, params)


runs = {}
for key in contexts:
    s = Session(key)
    pkg = ns["run"](s, key, "web")
    runs[key] = {"package": pkg, "events": s.events}

out = {"generated_from": "Salesforce export + Snowflake seeds + 07_scripted_agents.sql", "as_of": AS_OF.isoformat(),
       "owner": owner, "queue": queue, "contexts": contexts, "contacts": contacts_all, "runs": runs}
os.makedirs(os.path.join(ROOT, "orbit", "mock"), exist_ok=True)
p = os.path.join(ROOT, "orbit", "mock", "fixtures.json")
json.dump(out, open(p, "w"), indent=1, default=str)
print(p, os.path.getsize(p), "bytes;", {k: (r["package"].get("status"), r["package"].get("retries")) for k, r in runs.items()})
