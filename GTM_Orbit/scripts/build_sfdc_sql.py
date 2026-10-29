"""Builds the SQL that loads Salesforce records into GTM_DEMO.RAW_SFDC and APP.AE_DIRECTORY.

  python3 scripts/build_sfdc_sql.py           from your org: reads salesforce/export/*.csv
                                              (made by scripts/export_salesforce.sh)
                                              -> snowflake/05_salesforce_sync.sql
  python3 scripts/build_sfdc_sql.py --sample  no Salesforce org needed: reads salesforce/*.json
                                              (the same 10 accounts) with stand-in record IDs
                                              -> snowflake/05_salesforce_sample.sql
"""
import csv, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXP = os.path.join(ROOT, "salesforce", "export")

def q(v):
    if v is None or v == "": return "NULL"
    return "'" + v.replace("\\", "\\\\").replace("'", "''") + "'"
def ts(v):
    return "NULL" if not v else q(v[:19].replace("T", " "))
def b(v):
    return "TRUE" if str(v).lower() == "true" else "FALSE"
SAMPLE = "--sample" in sys.argv
AS_OF = "2026-10-23T09:00:00.000+0000"   # matches APP.DEMO_CONFIG.AS_OF_DATE
OWNER = {"OwnerId": "005ORB000000001AAA", "Owner.Name": "Alex Rivera", "Owner.Email": "ae@acme.example"}
PREFIX = {"Account": "001", "Contact": "003", "Opportunity": "006", "Case": "500"}
PROB = {"Prospecting": 10, "Qualification": 20, "Needs Analysis": 25, "Value Proposition": 50,
        "Id. Decision Makers": 60, "Perception Analysis": 70, "Proposal/Price Quote": 75,
        "Negotiation/Review": 90, "Closed Won": 100, "Closed Lost": 0}

def sample_rows():
    """Turns the import files in salesforce/*.json into rows shaped like the CSV export."""
    ids, out = {}, {}
    for name in ["Account", "Contact", "Opportunity", "Case"]:
        recs = json.load(open(os.path.join(ROOT, "salesforce", name + ".json"), encoding="utf-8"))["records"]
        rows_ = []
        for i, rec in enumerate(recs, 1):
            rid = PREFIX[name] + "ORB" + str(i).zfill(9) + "AAA"         # 18 characters, like a real ID
            ids["@" + rec["attributes"]["referenceId"]] = rid
            r = {k: ("" if v is None else str(v).lower() if isinstance(v, bool) else str(v))
                 for k, v in rec.items() if k != "attributes"}
            for k in ("AccountId", "ContactId"):
                if k in r: r[k] = ids.get(r[k], "")
            r.update(Id=rid, LastModifiedDate=AS_OF)
            if name == "Account":
                r.update(OWNER, BillingState=r.get("BillingStateCode", ""), BillingCountry=r.get("BillingCountryCode", ""))
            if name == "Opportunity":
                stage = r.get("StageName", "")
                r.update(IsClosed=str(stage.startswith("Closed")).lower(), IsWon=str(stage == "Closed Won").lower(),
                         Probability=str(PROB.get(stage, "")))
            if name == "Case":
                r.update(CaseNumber=str(1000 + i).zfill(8), CreatedDate=AS_OF)
            rows_.append(r)
        out[name] = rows_
    return out

_SAMPLE = sample_rows() if SAMPLE else None

def rows(name):
    if SAMPLE:
        return [{**{c: "" for c in COLS[name]}, **r} for r in _SAMPLE[name]]
    return list(csv.DictReader(open(os.path.join(EXP, name + ".csv"), newline="", encoding="utf-8")))

COLS = {
 "Account": ["Id", "Name", "AccountNumber", "Industry", "Type", "BillingCity", "BillingState", "BillingCountry",
             "NumberOfEmployees", "AnnualRevenue", "Website", "Description", "OwnerId", "Owner.Name", "Owner.Email", "LastModifiedDate"],
 "Contact": ["Id", "AccountId", "FirstName", "LastName", "Title", "Department", "Email", "Phone", "HasOptedOutOfEmail", "DoNotCall", "LastModifiedDate"],
 "Opportunity": ["Id", "AccountId", "Name", "StageName", "Type", "Amount", "Probability", "CloseDate", "NextStep", "IsClosed", "IsWon", "LastModifiedDate"],
 "Case": ["Id", "AccountId", "ContactId", "CaseNumber", "Subject", "Description", "Status", "Priority", "Origin", "CreatedDate", "LastModifiedDate"],
}

T = {
 "Account": ("GTM_DEMO.RAW_SFDC.ACCOUNT",
   "ID, NAME, ACCOUNT_NUMBER, INDUSTRY, TYPE, BILLING_CITY, BILLING_STATE, BILLING_COUNTRY, NUMBER_OF_EMPLOYEES, ANNUAL_REVENUE, WEBSITE, DESCRIPTION, OWNER_ID, OWNER_NAME, OWNER_EMAIL, LAST_MODIFIED_DATE",
   lambda r: [q(r["Id"]), q(r["Name"]), q(r["AccountNumber"]), q(r["Industry"]), q(r["Type"]), q(r["BillingCity"]),
              q(r["BillingState"]), q(r["BillingCountry"]), r["NumberOfEmployees"] or "NULL", r["AnnualRevenue"] or "NULL",
              q(r["Website"]), q(r["Description"]), q(r["OwnerId"]), q(r.get("Owner.Name")), q(r.get("Owner.Email")),
              ts(r["LastModifiedDate"])]),
 "Contact": ("GTM_DEMO.RAW_SFDC.CONTACT",
   "ID, ACCOUNT_ID, FIRST_NAME, LAST_NAME, TITLE, DEPARTMENT, EMAIL, PHONE, HAS_OPTED_OUT_OF_EMAIL, DO_NOT_CALL, LAST_MODIFIED_DATE",
   lambda r: [q(r["Id"]), q(r["AccountId"]), q(r["FirstName"]), q(r["LastName"]), q(r["Title"]), q(r["Department"]),
              q(r["Email"]), q(r["Phone"]), b(r["HasOptedOutOfEmail"]), b(r["DoNotCall"]), ts(r["LastModifiedDate"])]),
 "Opportunity": ("GTM_DEMO.RAW_SFDC.OPPORTUNITY",
   "ID, ACCOUNT_ID, NAME, STAGE_NAME, TYPE, AMOUNT, PROBABILITY, CLOSE_DATE, NEXT_STEP, IS_CLOSED, IS_WON, LAST_MODIFIED_DATE",
   lambda r: [q(r["Id"]), q(r["AccountId"]), q(r["Name"]), q(r["StageName"]), q(r["Type"]), r["Amount"] or "NULL",
              r["Probability"] or "NULL", q(r["CloseDate"]), q(r["NextStep"]), b(r["IsClosed"]), b(r["IsWon"]),
              ts(r["LastModifiedDate"])]),
 "Case": ("GTM_DEMO.RAW_SFDC.CASES",
   "ID, ACCOUNT_ID, CONTACT_ID, CASE_NUMBER, SUBJECT, DESCRIPTION, STATUS, PRIORITY, ORIGIN, CREATED_DATE, LAST_MODIFIED_DATE",
   lambda r: [q(r["Id"]), q(r["AccountId"]), q(r["ContactId"]), q(r["CaseNumber"]), q(r["Subject"]), q(r["Description"]),
              q(r["Status"]), q(r["Priority"]), q(r["Origin"]), ts(r["CreatedDate"]), ts(r["LastModifiedDate"])]),
}
SRC = "salesforce/*.json with stand-in IDs (no org needed)" if SAMPLE else "salesforce/export/ (your org)"
out = [f"-- GTM Orbit · 05 Salesforce records -> RAW_SFDC (generated by scripts/build_sfdc_sql.py from {SRC})",
       "USE ROLE ACCOUNTADMIN;", "USE WAREHOUSE GTM_DEMO_WH;"]
counts = {}
for name, (table, cols, fn) in T.items():
    data = rows(name); counts[name] = len(data)
    out.append(f"TRUNCATE TABLE {table};")
    out.append(f"INSERT INTO {table} ({cols}) VALUES\n" + ",\n".join("(" + ", ".join(fn(r)) + ")" for r in data) + ";")
out.append("TRUNCATE TABLE GTM_DEMO.APP.AE_DIRECTORY;")
out.append("INSERT INTO GTM_DEMO.APP.AE_DIRECTORY (SF_USER_ID, SF_USER_EMAIL, AE_NAME, SLACK_USER_ID) "
           "SELECT DISTINCT OWNER_ID, OWNER_EMAIL, OWNER_NAME, NULL FROM GTM_DEMO.RAW_SFDC.ACCOUNT;")
p = os.path.join(ROOT, "snowflake", "05_salesforce_sample.sql" if SAMPLE else "05_salesforce_sync.sql")
open(p, "w").write("\n".join(out) + "\n")
print(p, counts, os.path.getsize(p), "bytes")
