"""Builds scripts/seed_salesforce.apex from the Salesforce JSON files.
Anonymous Apex runs in system mode, so it is not blocked by field-level security
(e.g. Email Opt Out hidden in trial orgs). It first deletes any GTM-* demo records,
so it is safe to re-run."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SF = os.path.join(ROOT, "salesforce")
load = lambda n: json.load(open(os.path.join(SF, n)))["records"]

def lit(v):
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, str) and len(v) == 10 and v[4] == "-" and v[7] == "-" and v[:4].isdigit():
        return f"Date.valueOf('{v}')"
    return "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"

def fields(rec, skip=()):
    return ", ".join(f"{k}={lit(v)}" for k, v in rec.items() if k not in ("attributes",) + tuple(skip))

L = ["// GTM AI demo seed. Safe to re-run: removes existing GTM-* demo data first.",
     "List<Account> old = [SELECT Id FROM Account WHERE AccountNumber LIKE 'GTM-%'];",
     "delete [SELECT Id FROM Case WHERE AccountId IN :old];",
     "delete [SELECT Id FROM Opportunity WHERE AccountId IN :old];",
     "delete [SELECT Id FROM Contact WHERE AccountId IN :old];",
     "delete old;",
     "Map<String, Account> a = new Map<String, Account>();"]
for r in load("Account.json"):
    L.append(f"a.put('{r['attributes']['referenceId']}', new Account({fields(r)}));")
L.append("insert a.values();")
L.append("Map<String, Contact> c = new Map<String, Contact>();")
for r in load("Contact.json"):
    ref = r["AccountId"][1:]
    L.append(f"c.put('{r['attributes']['referenceId']}', new Contact(AccountId=a.get('{ref}').Id, {fields(r, ['AccountId'])}));")
L.append("insert c.values();")
L.append("List<Opportunity> o = new List<Opportunity>();")
for r in load("Opportunity.json"):
    L.append(f"o.add(new Opportunity(AccountId=a.get('{r['AccountId'][1:]}').Id, {fields(r, ['AccountId'])}));")
L.append("insert o;")
L.append("List<Case> k = new List<Case>();")
for r in load("Case.json"):
    L.append(f"k.add(new Case(AccountId=a.get('{r['AccountId'][1:]}').Id, ContactId=c.get('{r['ContactId'][1:]}').Id, "
             f"{fields(r, ['AccountId', 'ContactId'])}));")
L.append("insert k;")
L.append("System.debug('GTM_SEED_DONE accounts=' + a.size() + ' contacts=' + c.size() + ' opps=' + o.size() + ' cases=' + k.size());")
out = os.path.join(ROOT, "scripts", "seed_salesforce.apex")
open(out, "w").write("\n".join(L) + "\n")
print(out, os.path.getsize(out), "chars")
