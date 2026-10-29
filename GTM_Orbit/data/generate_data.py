"""
GTM AI demo — synthetic data generator.

Writes:
  salesforce/   sf CLI "tree" import files (Account, Contact, Opportunity, Case) + plan.json
  snowflake/seed/   CSVs for the Snowflake-only layers (simulated Gong, usage, intent,
                    critical events, scoring, sequences)

Everything is fictional. Websites/emails use the reserved .example domain.
The join key across Salesforce and Snowflake is Account.AccountNumber (GTM-0001 ...).

Run from the project root:  python3 data/generate_data.py
"""
import csv
import json
import os
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SF_DIR = os.path.join(ROOT, "salesforce")
SEED_DIR = os.path.join(ROOT, "snowflake", "seed")
AS_OF = date(2026, 10, 23)          # demo "today"; scores are stamped relative to this
SELLER = "Acme"                     # the fictional company the AE works for
REP = "Alex Rivera"                 # the AE persona in transcripts and drafts

# ---------------------------------------------------------------------------
# 1. Accounts — 10 accounts, each built for a specific demo beat
# ---------------------------------------------------------------------------
# story: what the account is for in the recording
ACCOUNTS = [
    dict(key="GTM-0001", name="Northstar Field Services", industry="Consulting", type="Customer - Direct",
         city="Denver", state="CO", country="United States", region="NA", employees=2400, revenue=410_000_000,
         site="northstarfield.example",
         desc="Field service operator running dispatch and scheduling across regional crews.",
         story="Hero account. Expansion opp + Oct 14 call on consolidating scheduling tools. "
               "Composer is tempted to claim 'expanding into three new regions' (not in evidence) -> validator retry."),
    dict(key="GTM-0002", name="Juniper Ridge Health", industry="Healthcare", type="Prospect",
         city="Dublin", state="", country="Ireland", region="EMEA", employees=1100, revenue=180_000_000,
         site="juniperridgehealth.example",
         desc="Health-tech provider rolling out a new EHR across clinics.",
         story="New logo, rising intent. Critical-events feature UNKNOWN. Trap claim: 'Series C funding round'."),
    dict(key="GTM-0003", name="Cobalt Ledger Systems", industry="Finance", type="Customer - Direct",
         city="Charlotte", state="NC", country="United States", region="NA", employees=650, revenue=95_000_000,
         site="cobaltledger.example",
         desc="Mid-market financial software company; finance team runs close workflows on Acme.",
         story="Upgrade. Stale evidence (scored 6 days ago), PTB/ROP UNSCORED, no calls in 90 days, "
               "seats at 92%. Incomplete contact data. Trap claim: 'replacing your ERP next quarter'."),
    dict(key="GTM-0004", name="Harborline Logistics", industry="Transportation", type="Customer - Direct",
         city="Oakland", state="CA", country="United States", region="NA", employees=3800, revenue=720_000_000,
         site="harborline.example",
         desc="Freight and last-mile logistics operator; Acme integrates with their TMS.",
         story="Renewal at risk. Escalated integration case, falling usage, competitor RouteSphere on the last call."),
    dict(key="GTM-0005", name="Verdant Grid Energy", industry="Energy", type="Prospect",
         city="Rotterdam", state="", country="Netherlands", region="EMEA", employees=900, revenue=240_000_000,
         site="verdantgrid.example",
         desc="Grid maintenance and field crew operator.",
         story="Failure mode: strong intent but every contact has opted out -> 'no permitted contact', no draft."),
    dict(key="GTM-0006", name="Tessellate Retail Group", industry="Retail", type="Prospect",
         city="Singapore", state="", country="Singapore", region="APAC", employees=5200, revenue=1_100_000_000,
         site="tessellateretail.example",
         desc="Multi-banner retailer with ~400 stores across Southeast Asia.",
         story="Mid-priority new logo from a webinar; competitor TaskNimbus mentioned."),
    dict(key="GTM-0007", name="Quarry & Pine Manufacturing", industry="Machinery", type="Customer - Direct",
         city="Grand Rapids", state="MI", country="United States", region="NA", employees=1500, revenue=300_000_000,
         site="quarrypine.example",
         desc="Industrial equipment manufacturer with two plants.",
         story="UNSCORED account: shows 'not scored' rather than 'low priority'."),
    dict(key="GTM-0008", name="Lumen Arc Media", industry="Media", type="Prospect",
         city="Austin", state="TX", country="United States", region="NA", employees=420, revenue=60_000_000,
         site="lumenarc.example",
         desc="Digital media studio producing branded content.",
         story="Closed-lost in April on budget; budget reopened on an Oct 20 call -> re-engagement."),
    dict(key="GTM-0009", name="Brightwater Insurance", industry="Insurance", type="Customer - Direct",
         city="Hartford", state="CT", country="United States", region="NA", employees=2900, revenue=880_000_000,
         site="brightwaterins.example",
         desc="Regional P&C insurer automating claims operations.",
         story="Clean expansion: proposal stage, 4 of 4 buying roles covered. The 'everything goes right' run."),
    dict(key="GTM-0010", name="Kestrel Biotech", industry="Biotechnology", type="Prospect",
         city="Basel", state="", country="Switzerland", region="EMEA", employees=300, revenue=40_000_000,
         site="kestrelbio.example",
         desc="Early-stage biotech with a growing lab operations team.",
         story="Low priority; no budget until 2027. Bottom of the queue."),
]

# ---------------------------------------------------------------------------
# 2. Contacts (Salesforce). opted_out -> HasOptedOutOfEmail; dnc -> DoNotCall
#    Buying role is NOT stored in Salesforce: the Identifier agent infers it from Title.
# ---------------------------------------------------------------------------
CONTACTS = {
    "GTM-0001": [("Riley", "Chen", "Director, Field Operations", "Operations", False, False),
                 ("Jordan", "Patel", "VP, Business Systems", "IT", False, False),
                 ("Morgan", "Ellis", "Operations Manager", "Operations", True, False)],
    "GTM-0002": [("Amara", "Okafor", "Head of Clinical Operations", "Clinical Operations", False, False),
                 ("Lukas", "Brandt", "IT Director", "IT", False, False),
                 ("Priya", "Nair", "Chief Financial Officer", "Finance", False, False)],
    "GTM-0003": [("Sam", "Okoro", "Corporate Controller", "Finance", False, False),
                 ("Chris", "Lam", "", "", False, False)],           # incomplete record on purpose
    "GTM-0004": [("Marcus", "Bell", "VP, Supply Chain", "Operations", False, False),
                 ("Nina", "Alvarez", "Director, IT Applications", "IT", False, False),
                 ("Owen", "Price", "Procurement Manager", "Procurement", False, False),
                 ("Grace", "Kim", "Dispatch Lead", "Operations", False, False)],
    "GTM-0005": [("Sven", "de Jong", "Head of Grid Operations", "Operations", True, False),
                 ("Femke", "Bakker", "Procurement Lead", "Procurement", True, False),
                 ("Pieter", "Smit", "Chief Technology Officer", "Technology", True, True)],
    "GTM-0006": [("Wei Ling", "Tan", "Head of Store Operations", "Operations", False, False),
                 ("Arjun", "Mehta", "Director, Retail Technology", "IT", False, False),
                 ("Hana", "Sato", "Marketing Operations Manager", "Marketing", False, False)],
    "GTM-0007": [("Greg", "Novak", "Plant Manager", "Operations", False, False),
                 ("Linda", "Ortiz", "VP, Operations", "Operations", False, False),
                 ("Tom", "Becker", "IT Manager", "IT", False, False)],
    "GTM-0008": [("Jasmine", "Reed", "VP, Content Operations", "Operations", False, False),
                 ("Carlos", "Mendez", "Head of Engineering", "Engineering", False, False)],
    "GTM-0009": [("Rachel", "Stone", "SVP, Claims Operations", "Claims", False, False),
                 ("David", "Park", "Director, Enterprise Architecture", "IT", False, False),
                 ("Monica", "Hayes", "VP, Finance", "Finance", False, False),
                 ("Kevin", "Liu", "Claims Systems Manager", "Claims", False, False)],
    "GTM-0010": [("Isabelle", "Roux", "Head of Lab Operations", "Operations", False, False),
                 ("Matthias", "Weber", "IT Lead", "IT", False, False)],
}

# ---------------------------------------------------------------------------
# 3. Opportunities (Salesforce)
# ---------------------------------------------------------------------------
OPPS = [
    ("GTM-0001", "Northstar - Platform", "Closed Won", "New Customer", 240000, "2025-06-30", ""),
    ("GTM-0001", "Northstar - Regional Scheduling Expansion", "Qualification", "Existing Customer - Upgrade",
     185000, "2026-12-15", "Confirm technical evaluator; scope dispatch integration"),
    ("GTM-0002", "Juniper Ridge - Clinical Ops Workflow", "Needs Analysis", "New Customer", 260000, "2027-01-31",
     "Map rollout sequencing against EHR go-live"),
    ("GTM-0003", "Cobalt Ledger - Initial Platform", "Closed Won", "New Customer", 90000, "2025-09-30", ""),
    ("GTM-0004", "Harborline - Platform", "Closed Won", "New Customer", 480000, "2024-12-31", ""),
    ("GTM-0004", "Harborline - FY27 Renewal", "Negotiation/Review", "Existing Customer - Replacement",
     520000, "2026-12-31", "Resolve TMS sync escalation before pricing discussion"),
    ("GTM-0006", "Tessellate - Store Ops Pilot", "Prospecting", "New Customer", 140000, "2027-03-31",
     "Pilot scope for 20 stores"),
    ("GTM-0007", "Quarry & Pine - Platform", "Closed Won", "New Customer", 150000, "2025-11-15", ""),
    ("GTM-0007", "Quarry & Pine - Plant 2 Rollout", "Prospecting", "Existing Customer - Upgrade", 70000,
     "2027-02-28", "Plant 2 onboarding plan"),
    ("GTM-0008", "Lumen Arc - Content Workflow", "Closed Lost", "New Customer", 95000, "2026-04-10",
     "Lost on budget; revisit for FY27"),
    ("GTM-0009", "Brightwater - Platform", "Closed Won", "New Customer", 410000, "2024-08-30", ""),
    ("GTM-0009", "Brightwater - Claims Automation Expansion", "Proposal/Price Quote", "Existing Customer - Upgrade",
     340000, "2026-11-30", "Security questionnaire due; procurement review"),
    ("GTM-0010", "Kestrel - Lab Ops Discovery", "Prospecting", "New Customer", 45000, "2027-06-30",
     "Budget not before 2027"),
]

# ---------------------------------------------------------------------------
# 4. Cases (Salesforce) — (account, contact last name, subject, description, status, priority, origin)
# ---------------------------------------------------------------------------
CASES = [
    ("GTM-0001", "Chen", "Add second region to scheduling workspace",
     "Customer asked how to add another regional workspace and share crew calendars.", "Closed", "Low", "Email"),
    ("GTM-0003", "Okoro", "Question about Enterprise tier features",
     "Finance team asked what audit trails, SSO and approval chains are included in the higher tier.",
     "Working", "Medium", "Email"),
    ("GTM-0003", "Okoro", "Seat limit warning on finance workspace",
     "Admin received a warning that the workspace is near its seat limit.", "New", "Low", "Web"),
    ("GTM-0004", "Alvarez", "Repeated sync failures with TMS integration",
     "Shipment status updates from the TMS fail to sync several times a week; dispatch team re-keys data.",
     "Escalated", "High", "Phone"),
    ("GTM-0004", "Kim", "Dispatch dashboard latency",
     "Dispatch dashboard took 20+ seconds to load during peak hours.", "Closed", "Medium", "Web"),
    ("GTM-0007", "Novak", "Plant 2 onboarding questions",
     "Questions about cloning plant 1 workflows for the second plant.", "New", "Low", "Email"),
    ("GTM-0009", "Park", "SSO configuration for new claims team",
     "Needs SAML group mapping for a new claims team of 120 users.", "Working", "Medium", "Email"),
]

# ---------------------------------------------------------------------------
# 5. Simulated Gong calls with transcripts and tracker hits
#    (call_id, account, date, title, duration_min, external participants, [(speaker, text, [trackers])])
#    The trap claims ("three new regions", "Series C", "replacing ERP") appear NOWHERE in this data.
# ---------------------------------------------------------------------------
R = f"{REP} ({SELLER})"
CALLS = [
    ("GONG-8650", "GTM-0001", "2026-09-02", "Northstar | Quarterly business review", 45, ["Riley Chen", "Jordan Patel"], [
        (R, "Thanks for making time. I wanted to walk through adoption since the platform went live.", []),
        ("Riley Chen", "Adoption is solid in the central region. Crews use it daily for job assignment.", []),
        ("Jordan Patel", "I joined in August to run business systems, so I'm still mapping what we have.", []),
        ("Jordan Patel", "We have a lot of overlapping tools. That's one of the things I've been asked to clean up.", ["Consolidation"]),
        (R, "Which tools overlap the most today?", []),
        ("Riley Chen", "Scheduling. Each region picked its own tool before we standardized dispatch.", ["Consolidation"]),
        ("Jordan Patel", "Let's pick that up next month once I have the inventory done.", ["Next steps"]),
    ]),
    ("GONG-8812", "GTM-0001", "2026-10-14", "Northstar | Scheduling consolidation check-in", 30, ["Riley Chen"], [
        (R, "Last time you mentioned scheduling tools differ by region. Where did the inventory land?", []),
        ("Riley Chen", "We're running three different scheduling tools across our field regions. It's a mess for dispatch.", ["Consolidation"]),
        ("Riley Chen", "The goal is to consolidate scheduling onto one platform and keep dispatch data in one place.", ["Consolidation"]),
        ("Riley Chen", "The big question is integration. Our dispatch system has to stay the source for job status.", ["Integration"]),
        (R, "That's the pattern we see with other service operators. The integration is usually the long pole.", []),
        ("Riley Chen", "Jordan wants a decision before Q1 planning closes.", ["Timeline"]),
        ("Riley Chen", "We don't have anyone technical on our side assigned yet, honestly.", []),
        (R, "I'll send a short outline of how others sequenced it.", ["Next steps"]),
    ]),
    ("GONG-8977", "GTM-0002", "2026-09-24", "Juniper Ridge | Intro call", 25, ["Amara Okafor"], [
        (R, "Thanks for responding to the webinar follow-up. What prompted the interest?", []),
        ("Amara Okafor", "We're rolling out a new EHR across our clinics and clinical ops workflows are still on spreadsheets.", ["Integration"]),
        ("Amara Okafor", "I'd want our IT director involved before we go further.", ["Next steps"]),
    ]),
    ("GONG-9034", "GTM-0002", "2026-10-09", "Juniper Ridge | Discovery", 50, ["Amara Okafor", "Lukas Brandt"], [
        (R, "Can you walk me through the EHR rollout plan?", []),
        ("Amara Okafor", "Clinics go live in waves. Integration timelines with the EHR vendor keep slipping.", ["Integration", "Timeline"]),
        ("Lukas Brandt", "Anything new needs to pass our security review and data residency checks in the EU.", ["Security"]),
        ("Lukas Brandt", "We looked at FlowBridge last year but it couldn't handle the EHR events.", ["Competitor"]),
        ("Amara Okafor", "Sequencing is the real problem: which clinic workflows move first.", []),
        ("Amara Okafor", "Our CFO would need to sign off on anything over budget, I'd have to check with her.", ["Budget"]),
        (R, "I'll share how other health-tech teams sequenced rollout around their EHR go-live.", ["Next steps"]),
    ]),
    ("GONG-7120", "GTM-0003", "2026-05-12", "Cobalt Ledger | Onboarding wrap-up", 20, ["Sam Okoro"], [
        (R, "You're fully onboarded. Anything blocking the finance team?", []),
        ("Sam Okoro", "No, close workflows are running well. We'll reach out if we need more seats.", []),
    ]),
    ("GONG-8890", "GTM-0004", "2026-09-18", "Harborline | Escalation review", 40, ["Nina Alvarez", "Grace Kim"], [
        ("Nina Alvarez", "The TMS sync is failing several times a week. Dispatch is re-keying shipment status by hand.", ["Integration", "Churn risk"]),
        ("Grace Kim", "My team has stopped trusting the dashboard. They check the TMS directly now.", ["Churn risk"]),
        (R, "That's on us. Engineering has a fix in testing and I'll get you a date.", ["Next steps"]),
    ]),
    ("GONG-9101", "GTM-0004", "2026-10-16", "Harborline | FY27 renewal discussion", 45, ["Marcus Bell", "Owen Price"], [
        (R, "I wanted to start the renewal conversation and hear how things are going.", []),
        ("Marcus Bell", "Honestly, the sync failures have hurt. My team has lost confidence.", ["Churn risk", "Integration"]),
        ("Marcus Bell", "We're also taking a look at RouteSphere. They pitched a native TMS connector.", ["Competitor"]),
        ("Owen Price", "Procurement will need a stronger price if we renew with the issues we've had.", ["Pricing"]),
        ("Marcus Bell", "Fix the sync and show me it's stable for a month, then we can talk.", ["Next steps"]),
    ]),
    ("GONG-8740", "GTM-0005", "2026-09-10", "Verdant Grid | Inbound demo", 35, ["Pieter Smit"], [
        ("Pieter Smit", "We schedule grid maintenance crews across the region and it's all manual today.", ["Consolidation"]),
        ("Pieter Smit", "We'll be publishing an RFP for crew scheduling software. Please don't contact the team directly until then.", ["Timeline"]),
    ]),
    ("GONG-9050", "GTM-0006", "2026-10-11", "Tessellate | Webinar follow-up", 30, ["Arjun Mehta"], [
        ("Arjun Mehta", "We roll out tasks to about 400 stores and have no idea what actually gets done.", []),
        ("Arjun Mehta", "We trialed TaskNimbus but store managers found it too heavy.", ["Competitor"]),
        ("Arjun Mehta", "A 20-store pilot would be the way in. Our head of store ops owns the budget.", ["Budget", "Next steps"]),
    ]),
    ("GONG-8601", "GTM-0007", "2026-08-28", "Quarry & Pine | Plant 2 planning", 30, ["Greg Novak"], [
        ("Greg Novak", "Plant 2 comes online in the spring. We'd like to clone our plant 1 workflows.", ["Timeline"]),
        ("Greg Novak", "Linda will want to see plant 1 results before approving more licenses.", ["Budget"]),
    ]),
    ("GONG-9120", "GTM-0008", "2026-10-20", "Lumen Arc | Reconnect", 25, ["Jasmine Reed"], [
        ("Jasmine Reed", "Good timing. Budget for content tooling reopened in our FY27 plan.", ["Budget", "Timeline"]),
        ("Jasmine Reed", "Price was the sticking point last time, so we'd want a smaller starting scope.", ["Pricing"]),
        (R, "That's easy to do. I'll come back with a phased option.", ["Next steps"]),
    ]),
    ("GONG-8833", "GTM-0009", "2026-09-29", "Brightwater | Technical deep dive", 55, ["David Park", "Kevin Liu"], [
        ("David Park", "Claims intake has to integrate with our policy admin system through the existing API gateway.", ["Integration"]),
        ("Kevin Liu", "The new claims team is 120 people. SSO group mapping has to work on day one.", ["Security"]),
    ]),
    ("GONG-9077", "GTM-0009", "2026-10-13", "Brightwater | Proposal review", 45, ["Rachel Stone", "Monica Hayes"], [
        ("Rachel Stone", "The expansion makes sense. Claims cycle time is the metric I'm measured on.", ["ROI"]),
        ("Monica Hayes", "I need the ROI model before this goes to procurement.", ["ROI", "Pricing"]),
        ("Monica Hayes", "Security questionnaire has to be back before November 15.", ["Security", "Timeline"]),
        (R, "I'll send the ROI model this week and get the questionnaire to our security team today.", ["Next steps"]),
    ]),
    ("GONG-8920", "GTM-0010", "2026-09-21", "Kestrel | Discovery", 25, ["Isabelle Roux"], [
        ("Isabelle Roux", "We're interested but there's no budget for new tools until 2027.", ["Budget", "Timeline"]),
    ]),
]

# ---------------------------------------------------------------------------
# 6. Snowflake-only signals
# ---------------------------------------------------------------------------
# Monthly product usage for customers: (account, seats_purchased, [active seats Mar..Oct], [workflows Mar..Oct])
MONTHS = [date(2026, m, 1) for m in range(3, 11)]
USAGE = {
    "GTM-0001": (300, [190, 205, 220, 238, 251, 262, 270, 274], [40, 44, 47, 52, 55, 58, 61, 63]),
    "GTM-0003": (100, [61, 66, 72, 78, 83, 87, 90, 92], [12, 13, 15, 16, 18, 19, 20, 21]),
    "GTM-0004": (800, [702, 690, 676, 640, 611, 572, 540, 515], [130, 128, 125, 118, 110, 101, 95, 90]),
    "GTM-0007": (200, [120, 131, 140, 148, 152, 155, 158, 160], [22, 24, 25, 27, 28, 28, 29, 30]),
    "GTM-0009": (650, [480, 502, 521, 540, 566, 590, 604, 615], [88, 92, 97, 101, 106, 111, 115, 118]),
}

# Weekly third-party intent (simulated): (account, topic, [intensity for last 6 weeks])
INTENT = [
    ("GTM-0001", "field service scheduling", [42, 48, 55, 61, 66, 70]),
    ("GTM-0002", "clinical workflow automation", [30, 38, 51, 63, 72, 78]),
    ("GTM-0002", "EHR integration", [25, 33, 40, 52, 58, 64]),
    ("GTM-0004", "TMS integration", [20, 26, 35, 44, 58, 67]),
    ("GTM-0004", "RouteSphere", [0, 5, 12, 25, 39, 51]),
    ("GTM-0005", "crew scheduling software", [35, 47, 59, 68, 77, 84]),
    ("GTM-0006", "store task management", [18, 22, 29, 33, 41, 45]),
    ("GTM-0008", "content operations platform", [10, 12, 18, 26, 31, 38]),
    ("GTM-0009", "claims automation", [44, 47, 50, 55, 57, 60]),
    ("GTM-0010", "lab operations software", [8, 9, 11, 10, 12, 14]),
]

# Critical events: (account, type, date, description, source)
EVENTS = [
    ("GTM-0001", "Executive hire", "2026-08-04", "New VP, Business Systems (Jordan Patel) joined", "Salesforce contact created"),
    ("GTM-0003", "Usage threshold", "2026-10-01", "Seat usage crossed 90% of plan", "Product usage"),
    ("GTM-0004", "Renewal window", "2026-10-01", "Renewal date 2026-12-31 within 90 days", "Salesforce opportunity"),
    ("GTM-0004", "Escalation", "2026-09-15", "High-priority integration case escalated", "Salesforce case"),
    ("GTM-0005", "RFP planned", "2026-09-10", "Prospect stated an RFP for crew scheduling is coming", "Gong call"),
    ("GTM-0008", "Budget reopened", "2026-10-20", "FY27 budget for content tooling reopened", "Gong call"),
    ("GTM-0009", "Procurement deadline", "2026-10-13", "Security questionnaire due 2026-11-15", "Gong call"),
]

# Scoring model output. Agents read these; they never recompute them.
# feature status: present / unknown / unscored
FEATURES = ["EWGS", "INTENT", "ENGAGEMENT", "CRITICAL_EVENTS", "PTB_ROP"]
P, U, X = "present", "unknown", "unscored"
SCORES = {
    #           score, days_old, rationale, feature statuses, growth vector
    "GTM-0001": (0.87, 0, "Open expansion opportunity, plus recent calls about consolidating scheduling tools across regions.",
                 [P, P, P, P, P], "Expansion"),
    "GTM-0002": (0.81, 1, "Strong ICP fit and rising intent; integration timelines came up on a discovery call.",
                 [P, P, P, U, P], "New logo"),
    "GTM-0003": (0.76, 6, "Upgrade propensity from seat usage and a recent support case about higher-tier features. No recent calls.",
                 [P, P, P, P, X], "Upgrade"),
    "GTM-0004": (0.69, 0, "Renewal within 90 days with an escalated integration case and declining active seats.",
                 [P, P, P, P, P], "Retention"),
    "GTM-0005": (0.72, 2, "Very high intent on crew scheduling and an RFP signal from an inbound demo.",
                 [P, P, U, P, P], "New logo"),
    "GTM-0006": (0.58, 3, "Moderate intent after a webinar; pilot interest from retail technology.",
                 [P, P, P, U, P], "New logo"),
    "GTM-0007": (None, None, "Not yet scored: account entered model scope after the last scoring run.",
                 [X, X, X, X, X], "Expansion"),
    "GTM-0008": (0.63, 0, "Previously lost on budget; budget reopened on a recent call.",
                 [P, P, P, P, U], "Re-engage"),
    "GTM-0009": (0.66, 1, "Expansion at proposal stage with steady usage growth and an active buying group.",
                 [P, P, P, P, P], "Expansion"),
    "GTM-0010": (0.41, 4, "Low intent and no budget before 2027.",
                 [P, P, P, U, U], "New logo"),
}

SEQUENCES = [
    ("EXPANSION_3TOUCH", "Expansion - 3 touch", "Expansion", 3, "Existing customer, new team or use case"),
    ("NEW_LOGO_4TOUCH", "New logo - 4 touch", "New logo", 4, "First outreach to a prospect"),
    ("UPGRADE_2TOUCH", "Upgrade - 2 touch", "Upgrade", 2, "Tier upgrade for an existing customer"),
    ("RENEWAL_SAVE_3TOUCH", "Renewal save - 3 touch", "Retention", 3, "At-risk renewal; lead with the fix, not price"),
    ("REENGAGE_2TOUCH", "Re-engage - 2 touch", "Re-engage", 2, "Previously lost or dormant opportunity"),
]


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------
COUNTRY_CODES = {"United States": "US", "Ireland": "IE", "Netherlands": "NL", "Singapore": "SG",
                 "Switzerland": "CH"}


def acct_ref(key):
    return "Acct" + key.replace("GTM-", "")


def contact_ref(key, last):
    return "Con" + key.replace("GTM-", "") + last.replace(" ", "").replace("'", "")


def email(first, last, site):
    return f"{first.split()[0].lower()}.{last.replace(' ', '').lower()}@{site}"


def write_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)


def write_csv(name, header, rows):
    with open(os.path.join(SEED_DIR, name), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def build_salesforce():
    by_key = {a["key"]: a for a in ACCOUNTS}
    accounts = []
    for a in ACCOUNTS:
        rec = {"attributes": {"type": "Account", "referenceId": acct_ref(a["key"])},
               "Name": a["name"], "AccountNumber": a["key"], "Industry": a["industry"], "Type": a["type"],
               "BillingCity": a["city"], "BillingCountryCode": COUNTRY_CODES[a["country"]],
               "NumberOfEmployees": a["employees"], "AnnualRevenue": a["revenue"],
               "Website": "https://" + a["site"], "Description": a["desc"]}
        if a["state"]:
            rec["BillingStateCode"] = a["state"]   # orgs with state/country picklists need codes
        accounts.append(rec)

    contacts = []
    for key, people in CONTACTS.items():
        site = by_key[key]["site"]
        for i, (first, last, title, dept, opted_out, dnc) in enumerate(people):
            rec = {"attributes": {"type": "Contact", "referenceId": contact_ref(key, last)},
                   "AccountId": "@" + acct_ref(key), "FirstName": first, "LastName": last,
                   "HasOptedOutOfEmail": opted_out, "DoNotCall": dnc}
            if title:
                rec["Title"] = title
                rec["Department"] = dept
                rec["Email"] = email(first, last, site)
                rec["Phone"] = f"+1-555-01{int(key[-2:]):02d}-{i:02d}"[:15]
            contacts.append(rec)

    opps = []
    for i, (key, name, stage, otype, amount, close, nxt) in enumerate(OPPS, 1):
        rec = {"attributes": {"type": "Opportunity", "referenceId": f"Opp{i:02d}"},
               "AccountId": "@" + acct_ref(key), "Name": name, "StageName": stage, "Type": otype,
               "Amount": amount, "CloseDate": close, "LeadSource": "Web" if otype == "New Customer" else "Other"}
        if nxt:
            rec["NextStep"] = nxt
        opps.append(rec)

    cases = []
    for i, (key, last, subject, desc, status, prio, origin) in enumerate(CASES, 1):
        cases.append({"attributes": {"type": "Case", "referenceId": f"Case{i:02d}"},
                      "AccountId": "@" + acct_ref(key), "ContactId": "@" + contact_ref(key, last),
                      "Subject": subject, "Description": desc, "Status": status,
                      "Priority": prio, "Origin": origin})

    os.makedirs(SF_DIR, exist_ok=True)
    write_json(os.path.join(SF_DIR, "Account.json"), {"records": accounts})
    write_json(os.path.join(SF_DIR, "Contact.json"), {"records": contacts})
    write_json(os.path.join(SF_DIR, "Opportunity.json"), {"records": opps})
    write_json(os.path.join(SF_DIR, "Case.json"), {"records": cases})
    write_json(os.path.join(SF_DIR, "plan.json"), [
        {"sobject": "Account", "saveRefs": True, "resolveRefs": False, "files": ["Account.json"]},
        {"sobject": "Contact", "saveRefs": True, "resolveRefs": True, "files": ["Contact.json"]},
        {"sobject": "Opportunity", "saveRefs": False, "resolveRefs": True, "files": ["Opportunity.json"]},
        {"sobject": "Case", "saveRefs": False, "resolveRefs": True, "files": ["Case.json"]},
    ])
    return len(accounts), len(contacts), len(opps), len(cases)


def build_snowflake_seeds():
    os.makedirs(SEED_DIR, exist_ok=True)

    write_csv("demo_accounts.csv", ["ACCOUNT_KEY", "ACCOUNT_NAME", "REGION", "DEMO_STORY"],
              [(a["key"], a["name"], a["region"], a["story"]) for a in ACCOUNTS])

    calls, utts, hits, parts = [], [], [], []
    for cid, key, d, title, dur, people, lines in CALLS:
        calls.append((cid, key, d, title, dur, "Outbound" if lines[0][0] == R else "Inbound",
                      f"https://gong.example/call/{cid}"))
        parts.append((cid, REP, SELLER, "Internal"))
        for p in people:
            parts.append((cid, p, key, "External"))
        offset = 0
        for n, (spk, text, trackers) in enumerate(lines, 1):
            utts.append((cid, n, offset, spk, text))
            for t in trackers:
                hits.append((cid, n, t, text))
            offset += 35 + len(text) // 3
    write_csv("gong_calls.csv", ["CALL_ID", "ACCOUNT_KEY", "CALL_DATE", "TITLE", "DURATION_MIN", "DIRECTION", "CALL_URL"], calls)
    write_csv("gong_call_participants.csv", ["CALL_ID", "PARTICIPANT_NAME", "AFFILIATION", "SIDE"], parts)
    write_csv("gong_transcript_utterances.csv", ["CALL_ID", "UTTERANCE_NUM", "START_SEC", "SPEAKER", "TEXT"], utts)
    write_csv("gong_tracker_hits.csv", ["CALL_ID", "UTTERANCE_NUM", "TRACKER", "SNIPPET"], hits)

    usage = []
    for key, (purchased, seats, flows) in USAGE.items():
        for m, s, w in zip(MONTHS, seats, flows):
            usage.append((key, m.isoformat(), purchased, s, w))
    write_csv("product_usage_monthly.csv", ["ACCOUNT_KEY", "MONTH", "SEATS_PURCHASED", "SEATS_ACTIVE", "ACTIVE_WORKFLOWS"], usage)

    intent = []
    for key, topic, series in INTENT:
        for i, v in enumerate(series):
            week = AS_OF - timedelta(days=AS_OF.weekday()) - timedelta(weeks=len(series) - 1 - i)
            intent.append((key, week.isoformat(), topic, v, "3P intent (simulated)"))
    write_csv("intent_signals_weekly.csv", ["ACCOUNT_KEY", "WEEK_START", "TOPIC", "INTENSITY", "SOURCE"], intent)

    write_csv("critical_events.csv", ["ACCOUNT_KEY", "EVENT_TYPE", "EVENT_DATE", "DESCRIPTION", "SOURCE"], EVENTS)

    scores, growth = [], []
    for key, (score, age, rationale, statuses, gv) in SCORES.items():
        scored_at = "" if age is None else f"{(AS_OF - timedelta(days=age)).isoformat()} 06:00:00"
        fs = json.dumps(dict(zip(FEATURES, statuses)))
        scores.append((key, "" if score is None else score, "ps_v3.2", scored_at, rationale, fs))
        growth.append((key, gv))
    write_csv("priority_scores.csv", ["ACCOUNT_KEY", "PRIORITY_SCORE", "SCORE_VERSION", "SCORED_AT", "SCORE_RATIONALE", "FEATURE_STATUS"], scores)
    write_csv("growth_vector.csv", ["ACCOUNT_KEY", "GROWTH_VECTOR"], growth)
    write_csv("sequences.csv", ["SEQUENCE_ID", "SEQUENCE_NAME", "GROWTH_VECTOR", "TOUCHES", "DESCRIPTION"], SEQUENCES)
    return len(calls), len(utts), len(hits)


if __name__ == "__main__":
    a, c, o, k = build_salesforce()
    n_calls, n_utts, n_hits = build_snowflake_seeds()
    print(f"Salesforce: {a} accounts, {c} contacts, {o} opportunities, {k} cases -> {SF_DIR}")
    print(f"Snowflake seeds: {n_calls} calls, {n_utts} utterances, {n_hits} tracker hits -> {SEED_DIR}")
