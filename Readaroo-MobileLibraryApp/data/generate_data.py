#!/usr/bin/env python3
"""Generate every Readaroo seed file from one place.

Outputs (all synthetic, all fictional):
  data/seed.json      used by the offline store, the tests and the HTML demo
  db/002_seed.sql     loads the same records into Postgres

Run:  python3 data/generate_data.py
Running it twice produces byte-identical files.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CONFIG = {
    "now": "2026-11-03T19:00:00Z",       # the demo's pinned "today"
    "instantWaitThresholdDays": 28,      # instant borrow only when the wait is at least this long
    "staleHours": 24,                    # availability older than this is "check availability"
    "daysPerQueueTurn": 10,              # rough days per turn in a hold line
    "streakMinMinutes": 5,               # minutes in a day that count toward a streak
    "weeklyGoalDays": 5,                 # reading days per week a family aims for
    "readingSecondsPerMinute": 1,        # demo speed: 1 real second = 1 reading minute (set 60 for real use)
    "newArrivalDays": 30,                # "new" = released within this many days
}

LIBRARIES = [
    {"id": "lib-county", "name": "Maple County Library", "dailyCapCents": 800, "monthlyCapCents": 6000,
     "spentDay": "2026-11-03", "spentTodayCents": 0, "spentMonthCents": 1200, "stripeCustomerId": None},
    {"id": "lib-city", "name": "Riverbend City Library", "dailyCapCents": 300, "monthlyCapCents": 4000,
     "spentDay": "2026-11-03", "spentTodayCents": 300, "spentMonthCents": 2100, "stripeCustomerId": None},
]

FAMILY = {"id": "fam-1", "name": "Our family"}

MEMBERS = [
    {"id": "m-priya", "familyId": "fam-1", "name": "Priya", "role": "parent", "age": None, "bandMin": None, "bandMax": None,
     "email": "priya@readaroo.example"},
    {"id": "m-arjun", "familyId": "fam-1", "name": "Arjun", "role": "kid", "age": 9, "bandMin": 8, "bandMax": 10, "email": None},
    {"id": "m-maya", "familyId": "fam-1", "name": "Maya", "role": "kid", "age": 6, "bandMin": 5, "bandMax": 7, "email": None},
]

CARDS = [
    {"id": "card-1", "familyId": "fam-1", "libraryId": "lib-county", "label": "Maple County card"},
    {"id": "card-2", "familyId": "fam-1", "libraryId": "lib-city", "label": "Riverbend City card"},
]

# minAge/maxAge None = reading level unknown (record R7)
TITLES = [
    {"id": "t-moonfox-1", "title": "The Moon Fox", "author": "Lena Okafor", "series": "Moon Fox", "seriesNo": 1,
     "minAge": 8, "maxAge": 11, "themes": ["animals", "quest", "night"], "color": "#2E4A7A"},
    {"id": "t-moonfox-2", "title": "The Moon Fox: River of Stars", "author": "Lena Okafor", "series": "Moon Fox", "seriesNo": 2,
     "minAge": 8, "maxAge": 11, "themes": ["animals", "quest", "night"], "color": "#34558C"},
    {"id": "t-comet-1", "title": "The Comet Kids", "author": "Lena Okafor", "series": "Comet Kids", "seriesNo": 1,
     "minAge": 8, "maxAge": 11, "themes": ["space", "quest", "friendship"], "color": "#C9572E"},
    {"id": "t-comet-2", "title": "The Comet Kids: Orbit Street", "author": "Lena Okafor", "series": "Comet Kids", "seriesNo": 2,
     "minAge": 8, "maxAge": 11, "themes": ["space", "quest", "friendship"], "color": "#B04A26"},
    {"id": "t-owl", "title": "Owl Lantern Nights", "author": "Sam Whitlow", "series": None, "seriesNo": None,
     "minAge": 8, "maxAge": 10, "themes": ["animals", "night", "friendship"], "color": "#3B6E4F"},
    {"id": "t-badger", "title": "Badger Builds a Boat", "author": "Tomas Reyes", "series": None, "seriesNo": None,
     "minAge": 7, "maxAge": 10, "themes": ["animals", "quest"], "color": "#7A5A2E"},
    {"id": "t-starlight", "title": "Starlight Express Club", "author": "June Adeyemi", "series": None, "seriesNo": None,
     "minAge": 8, "maxAge": 11, "themes": ["trains", "friendship"], "color": "#6F5AA8"},
    {"id": "t-tide-2", "title": "Tidecallers: The Salt Gate", "author": "Ines Marlow", "series": "Tidecallers", "seriesNo": 2,
     "minAge": 9, "maxAge": 12, "themes": ["ocean", "quest"], "color": "#1F6E7A"},
    {"id": "t-deepsea", "title": "Deep Sea Detectives", "author": "Ines Marlow", "series": "Deep Sea Detectives", "seriesNo": 1,
     "minAge": 11, "maxAge": 13, "themes": ["ocean", "mystery"], "color": "#1F3D4A"},
    {"id": "t-lighthouse", "title": "The Lighthouse Mice", "author": "Sam Whitlow", "series": None, "seriesNo": None,
     "minAge": 7, "maxAge": 10, "themes": ["animals", "quest", "night"], "color": "#5C6B8A"},
    {"id": "t-whiskers", "title": "Inspector Whiskers", "author": "Dana Pell", "series": None, "seriesNo": None,
     "minAge": None, "maxAge": None, "themes": ["animals", "mystery"], "color": "#8A6D3B"},
    {"id": "t-garden", "title": "The Garden Gnome Club", "author": "June Adeyemi", "series": None, "seriesNo": None,
     "minAge": 6, "maxAge": 8, "themes": ["friendship"], "color": "#5E8C3A"},
    {"id": "t-puddle", "title": "Puddle Jumpers", "author": "Rosa Lind", "series": None, "seriesNo": None,
     "minAge": 4, "maxAge": 7, "themes": ["rain", "friendship"], "color": "#3E7CB1"},
    {"id": "t-rainy", "title": "Rainy Day Rabbit", "author": "Rosa Lind", "series": None, "seriesNo": None,
     "minAge": 4, "maxAge": 6, "themes": ["rain", "animals"], "color": "#6A8FB3"},
    {"id": "t-orchard", "title": "The Quiet Orchard", "author": "Mara Vance", "series": None, "seriesNo": None,
     "minAge": 18, "maxAge": 99, "themes": ["family", "literary"], "color": "#8C4A5E"},
    # v1.1: reading-now books, new arrivals and a coming-soon sequel
    {"id": "t-kite", "title": "The Paper Kite Club", "author": "Sam Whitlow", "series": None, "seriesNo": None,
     "minAge": 8, "maxAge": 10, "themes": ["friendship", "quest"], "color": "#B5833A"},
    {"id": "t-snail", "title": "The Snail Who Raced", "author": "Rosa Lind", "series": None, "seriesNo": None,
     "minAge": 4, "maxAge": 7, "themes": ["animals", "friendship"], "color": "#7C9A4B"},
    {"id": "t-ferry", "title": "Night Ferry", "author": "Mara Vance", "series": None, "seriesNo": None,
     "minAge": 18, "maxAge": 99, "themes": ["literary", "family"], "color": "#3D4E6B"},
    {"id": "t-moonfox-3", "title": "The Moon Fox: Ember Sky", "author": "Lena Okafor", "series": "Moon Fox", "seriesNo": 3,
     "minAge": 8, "maxAge": 11, "themes": ["animals", "quest", "night"], "color": "#5B3E8C"},
    {"id": "t-harbor", "title": "Kites Over Harbor Street", "author": "Sam Whitlow", "series": None, "seriesNo": None,
     "minAge": 8, "maxAge": 11, "themes": ["friendship", "ocean"], "color": "#2F7E8C"},
    {"id": "t-gnome-2", "title": "The Garden Gnome Club: Moonlight Market", "author": "June Adeyemi", "series": "Garden Gnome Club", "seriesNo": 2,
     "minAge": 5, "maxAge": 8, "themes": ["friendship", "night"], "color": "#4E7A33"},
]

# Extra title facts: page count, release date, and a synthetic "loved by readers this age" rating
TITLE_EXTRA = {
    "t-moonfox-1": (212, "2025-03-04", 91, 318), "t-moonfox-2": (236, "2026-04-14", 89, 141),
    "t-comet-1": (198, "2024-09-10", 86, 260), "t-comet-2": (204, "2025-10-07", 84, 97),
    "t-owl": (164, "2023-05-02", 82, 201), "t-badger": (96, "2022-08-16", 78, 88),
    "t-starlight": (184, "2024-02-20", 80, 77), "t-tide-2": (260, "2025-06-03", 83, 64),
    "t-deepsea": (288, "2024-11-12", 88, 120), "t-lighthouse": (148, "2023-10-03", 79, 54),
    "t-whiskers": (120, "2021-04-06", None, 0), "t-garden": (72, "2023-03-14", 85, 133),
    "t-puddle": (32, "2022-04-05", 90, 210), "t-rainy": (28, "2021-09-21", 87, 175),
    "t-orchard": (352, "2026-01-13", 81, 402), "t-kite": (176, "2025-08-19", 87, 156),
    "t-snail": (32, "2024-05-07", 84, 98), "t-ferry": (340, "2026-08-25", 79, 233),
    "t-moonfox-3": (240, "2026-12-01", None, 0), "t-harbor": (190, "2026-10-28", 92, 26),
    "t-gnome-2": (80, "2026-10-21", 88, 31),
}
for _t in TITLES:
    _p, _r, _pct, _n = TITLE_EXTRA[_t["id"]]
    _t.update({"pages": _p, "releaseDate": _r, "ratingPct": _pct, "ratingCount": _n})

# ppuCents = price for a library-funded instant borrow; None = no pay-per-use rights for that title there
FRESH = "2026-11-03T18:00:00Z"
STALE = "2026-10-31T09:00:00Z"   # record R6: three days old
COPIES = [
    {"titleId": "t-moonfox-1", "libraryId": "lib-county", "owned": 3, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-moonfox-2", "libraryId": "lib-county", "owned": 3, "available": 0, "queue": 14, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-moonfox-2", "libraryId": "lib-city", "owned": 1, "available": 0, "queue": 6, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-comet-1", "libraryId": "lib-county", "owned": 2, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-comet-2", "libraryId": "lib-county", "owned": 1, "available": 0, "queue": 7, "asOf": FRESH, "ppuCents": 249},
    {"titleId": "t-owl", "libraryId": "lib-county", "owned": 2, "available": 2, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-owl", "libraryId": "lib-city", "owned": 1, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-badger", "libraryId": "lib-county", "owned": 1, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-starlight", "libraryId": "lib-county", "owned": 1, "available": 0, "queue": 8, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-starlight", "libraryId": "lib-city", "owned": 2, "available": 0, "queue": 2, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-tide-2", "libraryId": "lib-city", "owned": 1, "available": 0, "queue": 5, "asOf": FRESH, "ppuCents": 299},
    {"titleId": "t-deepsea", "libraryId": "lib-county", "owned": 2, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-lighthouse", "libraryId": "lib-city", "owned": 1, "available": 1, "queue": 0, "asOf": STALE, "ppuCents": None},
    {"titleId": "t-whiskers", "libraryId": "lib-county", "owned": 1, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-garden", "libraryId": "lib-city", "owned": 1, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-puddle", "libraryId": "lib-county", "owned": 2, "available": 2, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-rainy", "libraryId": "lib-county", "owned": 1, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-orchard", "libraryId": "lib-city", "owned": 2, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-kite", "libraryId": "lib-county", "owned": 2, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-snail", "libraryId": "lib-county", "owned": 2, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-ferry", "libraryId": "lib-city", "owned": 3, "available": 0, "queue": 2, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-moonfox-3", "libraryId": "lib-county", "owned": 0, "available": 0, "queue": 9, "asOf": FRESH, "ppuCents": None, "onOrder": 3},
    {"titleId": "t-harbor", "libraryId": "lib-county", "owned": 2, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
    {"titleId": "t-gnome-2", "libraryId": "lib-city", "owned": 1, "available": 1, "queue": 0, "asOf": FRESH, "ppuCents": None},
]
for _c in COPIES:
    _c.setdefault("onOrder", 0)

HOLDS = [
    {"id": "hold-1", "familyId": "fam-1", "memberId": "m-arjun", "titleId": "t-moonfox-2", "libraryId": "lib-county",
     "position": 14, "status": "waiting", "createdAt": "2026-10-30T20:00:00Z"},
]

BORROWS = [
    {"id": "borrow-1", "familyId": "fam-1", "memberId": "m-arjun", "titleId": "t-moonfox-1", "libraryId": "lib-county",
     "kind": "standard", "borrowedAt": "2026-10-20T19:00:00Z", "finishedAt": "2026-10-30T19:30:00Z", "minutesRead": 240, "costCents": 0},
    {"id": "borrow-2", "familyId": "fam-1", "memberId": "m-maya", "titleId": "t-rainy", "libraryId": "lib-county",
     "kind": "standard", "borrowedAt": "2026-10-27T18:00:00Z", "finishedAt": "2026-11-01T18:20:00Z", "minutesRead": 75, "costCents": 0},
    {"id": "borrow-3", "familyId": "fam-1", "memberId": "m-priya", "titleId": "t-orchard", "libraryId": "lib-city",
     "kind": "standard", "borrowedAt": "2026-10-25T21:00:00Z", "finishedAt": "2026-11-02T22:00:00Z", "minutesRead": 300, "costCents": 0},
    # Reading now (record R10: progress is saved even if you close the app mid-chapter)
    {"id": "borrow-4", "familyId": "fam-1", "memberId": "m-arjun", "titleId": "t-kite", "libraryId": "lib-county",
     "kind": "standard", "borrowedAt": "2026-10-31T18:00:00Z", "finishedAt": None, "minutesRead": 70, "costCents": 0},
    {"id": "borrow-5", "familyId": "fam-1", "memberId": "m-maya", "titleId": "t-snail", "libraryId": "lib-county",
     "kind": "standard", "borrowedAt": "2026-11-01T17:00:00Z", "finishedAt": None, "minutesRead": 0, "costCents": 0},
    {"id": "borrow-6", "familyId": "fam-1", "memberId": "m-priya", "titleId": "t-ferry", "libraryId": "lib-city",
     "kind": "standard", "borrowedAt": "2026-11-02T21:00:00Z", "finishedAt": None, "minutesRead": 35, "costCents": 0},
]
# Where each open book was left off (page) and when
PROGRESS = {"borrow-4": (112, "2026-11-02T19:40:00Z"), "borrow-5": (0, None), "borrow-6": (31, "2026-11-02T22:10:00Z")}
for _b in BORROWS:
    _pg, _at = PROGRESS.get(_b["id"], (None, None))
    if _b["finishedAt"]:
        _pg = next(t["pages"] for t in TITLES if t["id"] == _b["titleId"])
        _at = _b["finishedAt"]
    _b.update({"currentPage": _pg or 0, "lastReadAt": _at})

# Reading sessions drive streaks and the digest's reading time (record R11)
def _sessions():
    rows = []
    plan = [
        ("m-arjun", "borrow-1", ["2026-10-22", "2026-10-23", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-29", "2026-10-30"], 30),
        ("m-arjun", "borrow-4", ["2026-10-31", "2026-11-01", "2026-11-02"], 25),
        ("m-maya", "borrow-2", ["2026-10-28", "2026-10-29", "2026-10-31"], 25),
        ("m-priya", "borrow-3", ["2026-10-30", "2026-11-01"], 60),
        ("m-priya", "borrow-6", ["2026-11-02"], 35),
    ]
    n = 0
    for member, borrow, days, minutes in plan:
        for d in days:
            n += 1
            rows.append({"id": f"sess-{n:02d}", "clientId": f"seed-{n:02d}", "borrowId": borrow, "memberId": member,
                         "day": d, "minutes": minutes, "toPage": None, "at": f"{d}T19:30:00Z"})
    return rows

SESSIONS = _sessions()

# Want-to-read lists (record R9)
TBR = [
    {"memberId": "m-arjun", "titleId": "t-harbor", "addedBy": "m-arjun", "source": "self", "addedAt": "2026-10-29T18:00:00Z"},
    {"memberId": "m-arjun", "titleId": "t-starlight", "addedBy": "m-priya", "source": "parent", "addedAt": "2026-10-30T20:00:00Z"},
    {"memberId": "m-maya", "titleId": "t-gnome-2", "addedBy": "m-priya", "source": "parent", "addedAt": "2026-11-01T09:00:00Z"},
    {"memberId": "m-priya", "titleId": "t-ferry", "addedBy": "m-priya", "source": "self", "addedAt": "2026-10-20T09:00:00Z"},
]

# Librarian-curated starter shelves by age group
SHELVES = [
    {"id": "shelf-4-7", "name": "Ages 4–7: read-aloud favorites", "minAge": 4, "maxAge": 7, "curator": "Maple County youth librarians",
     "titleIds": ["t-puddle", "t-rainy", "t-snail", "t-gnome-2", "t-garden"]},
    {"id": "shelf-8-10", "name": "Ages 8–10: first big series", "minAge": 8, "maxAge": 10, "curator": "Maple County youth librarians",
     "titleIds": ["t-moonfox-1", "t-comet-1", "t-kite", "t-owl", "t-harbor", "t-badger"]},
    {"id": "shelf-11-13", "name": "Ages 11–13: mysteries and quests", "minAge": 11, "maxAge": 13, "curator": "Riverbend City teen librarians",
     "titleIds": ["t-deepsea", "t-tide-2"]},
    {"id": "shelf-adult", "name": "Grown-ups: book club picks", "minAge": 18, "maxAge": 99, "curator": "Riverbend City adult services",
     "titleIds": ["t-orchard", "t-ferry"]},
]

FOLLOWS = [
    {"memberId": "m-arjun", "kind": "series", "value": "Moon Fox"},
]

# Author talks, storytimes, book clubs and signings at fictional bookstores and libraries (record R14)
MEETUPS = [
    {"id": "meet-okafor", "title": "Lena Okafor: drawing the Moon Fox", "kind": "author talk", "author": "Lena Okafor",
     "series": "Moon Fox", "venue": "Paper Lantern Books", "venueKind": "bookstore", "address": "214 Alder Street, Maple County",
     "startsAt": "2026-11-15T18:30:00Z", "endsAt": "2026-11-15T19:30:00Z", "minAge": 7, "maxAge": 11, "capacity": 40, "seatsTaken": 37,
     "priceCents": 0, "description": "The author draws the Moon Fox live, reads from Ember Sky before it comes out, and answers kids' questions."},
    {"id": "meet-storytime", "title": "Rainy Day Storytime with Rosa Lind", "kind": "storytime", "author": "Rosa Lind",
     "series": None, "venue": "Maple County Library, Main Branch", "venueKind": "library", "address": "1 Library Plaza, Maple County",
     "startsAt": "2026-11-08T18:00:00Z", "endsAt": "2026-11-08T18:45:00Z", "minAge": 3, "maxAge": 7, "capacity": 25, "seatsTaken": 25,
     "priceCents": 0, "description": "Puddle-jumping stories and a craft table. Bring rain boots if you like."},
    {"id": "meet-bookclub", "title": "Kids' Book Club: The Comet Kids", "kind": "book club", "author": None,
     "series": "Comet Kids", "venue": "Riverbend City Library, Harbor Branch", "venueKind": "library", "address": "88 Harbor Way, Riverbend",
     "startsAt": "2026-11-21T00:30:00Z", "endsAt": "2026-11-21T01:30:00Z", "minAge": 8, "maxAge": 11, "capacity": 15, "seatsTaken": 6,
     "priceCents": 0, "description": "Read book 1 before you come. Snacks and a trivia round."},
    {"id": "meet-vance", "title": "Mara Vance signs Night Ferry", "kind": "signing", "author": "Mara Vance",
     "series": None, "venue": "Owl & Ink Bookshop", "venueKind": "bookstore", "address": "9 Mill Lane, Riverbend",
     "startsAt": "2026-11-13T03:00:00Z", "endsAt": "2026-11-13T04:00:00Z", "minAge": 18, "maxAge": 99, "capacity": 60, "seatsTaken": 22,
     "priceCents": 0, "description": "Conversation and signing for grown-ups."},
    {"id": "meet-past", "title": "Halloween Spooky Reads", "kind": "storytime", "author": None,
     "series": None, "venue": "Maple County Library, Main Branch", "venueKind": "library", "address": "1 Library Plaza, Maple County",
     "startsAt": "2026-10-31T17:00:00Z", "endsAt": "2026-10-31T18:00:00Z", "minAge": 4, "maxAge": 10, "capacity": 30, "seatsTaken": 30,
     "priceCents": 0, "description": "Already happened; hidden from upcoming lists."},
]

REACTIONS = [
    {"id": "react-1", "borrowId": "borrow-1", "memberId": "m-arjun", "reaction": "loved", "at": "2026-10-30T19:31:00Z"},
    {"id": "react-2", "borrowId": "borrow-2", "memberId": "m-maya", "reaction": "ok", "at": "2026-11-01T18:21:00Z"},
]

# What each demo record proves (shown in the app's "Demo records" panel and the README)
DEMO_RECORDS = [
    {"id": "R1", "titleId": "t-moonfox-2", "memberId": "m-arjun", "label": "Hero run",
     "proves": "Book 2 is on hold (#14). Next-Up offers 3 available read-alikes to borrow tonight."},
    {"id": "R2", "titleId": "t-starlight", "memberId": "m-arjun", "label": "Smart holds",
     "proves": "Not available anywhere. The hold goes to the card with the shortest line (Riverbend City)."},
    {"id": "R3", "titleId": "t-comet-2", "memberId": "m-arjun", "label": "Instant borrow under cap",
     "proves": "Series book 2 with an 11-week wait. Maple County funds an instant borrow and meters it in Stripe test mode."},
    {"id": "R4", "titleId": "t-tide-2", "memberId": "m-arjun", "label": "Cap reached, product stops",
     "proves": "Riverbend City's daily cap is spent. No instant borrow is offered, the server refuses one if asked, nothing is charged."},
    {"id": "R5", "titleId": "t-deepsea", "memberId": "m-arjun", "label": "Parent approval",
     "proves": "Ages 11-13 is outside Arjun's band (8-10). His request waits for a parent."},
    {"id": "R6", "titleId": "t-lighthouse", "memberId": "m-arjun", "label": "Stale availability",
     "proves": "Availability is 3 days old, so it shows 'check availability' until the library syncs."},
    {"id": "R7", "titleId": "t-whiskers", "memberId": "m-arjun", "label": "Missing data shown as unknown",
     "proves": "No reading level in the catalog. Shown as 'level unknown', kept out of Next-Up, needs approval for kids."},
    {"id": "R8", "titleId": "t-puddle", "memberId": "m-maya", "label": "Clean run",
     "proves": "In Maya's band and available. Borrowed in one tap, no approval."},
    {"id": "R9", "view": "lists", "memberId": "m-arjun", "label": "Want-to-read list by age group",
     "proves": "Arjun's list shows what's ready now. Starter shelves are grouped by age; adding a book outside his band is fine, borrowing it needs a parent."},
    {"id": "R10", "view": "reader", "borrowId": "borrow-4", "memberId": "m-arjun", "label": "Pick up where you left off",
     "proves": "The Paper Kite Club opens at page 112. Leave the page mid-chapter and your time and page are still saved."},
    {"id": "R11", "view": "home", "memberId": "m-arjun", "label": "Streak with a rest day",
     "proves": "Arjun has an 8-day streak; one missed day a week doesn't break it. Read 5 minutes today to make it 9. Maya's broken streak gets a fresh start, not a scolding."},
    {"id": "R12", "view": "discover", "memberId": "m-arjun", "label": "Good picks for you",
     "proves": "Because Arjun loved The Moon Fox: the next book in the series, more by Lena Okafor, and books rated highly by readers his age, each with its reason."},
    {"id": "R13", "view": "discover", "memberId": "m-arjun", "label": "New releases and coming soon",
     "proves": "Arjun follows Moon Fox, so Ember Sky (out Dec 1, on order) shows up first with a pre-release hold. New arrivals from the last 30 days follow."},
    {"id": "R14", "view": "events", "memberId": "m-priya", "label": "Author talks and meetups",
     "proves": "Lena Okafor is at Paper Lantern Books (3 seats left). Kids under 13 go with a grown-up; the full storytime puts you on the waitlist."},
]


def sql_val(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return "ARRAY[" + ",".join(sql_val(x) for x in v) + "]::text[]" if v else "ARRAY[]::text[]"
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, cols, rows):
    out = []
    for r in rows:
        vals = ", ".join(sql_val(r[c]) for c in cols)
        out.append(f"INSERT INTO {table} ({', '.join(snake(c) for c in cols)}) VALUES ({vals});")
    return "\n".join(out)


def snake(name):
    s = ""
    for ch in name:
        s += ("_" + ch.lower()) if ch.isupper() else ch
    return s


def main():
    seed = {
        "config": CONFIG, "libraries": LIBRARIES, "family": FAMILY, "members": MEMBERS, "cards": CARDS,
        "titles": TITLES, "copies": COPIES, "holds": HOLDS, "borrows": BORROWS, "reactions": REACTIONS,
        "sessions": SESSIONS, "tbr": TBR, "shelves": SHELVES, "follows": FOLLOWS, "meetups": MEETUPS,
        "demoRecords": DEMO_RECORDS,
    }
    (ROOT / "data" / "seed.json").write_text(json.dumps(seed, indent=2) + "\n")

    parts = [
        "-- Generated by data/generate_data.py. Do not edit by hand.",
        "-- Every person, library and book here is fictional.",
        "BEGIN;",
        "TRUNCATE events, meter_events, feedback, reactions, approvals, sessions, rsvps, meetups, follows, tbr, shelf_titles, shelves, borrows, holds, copies, titles, cards, members, families, libraries, app_config RESTART IDENTITY CASCADE;",
        insert("app_config", ["key", "value"], [{"key": k, "value": str(v)} for k, v in CONFIG.items()]),
        insert("libraries", ["id", "name", "dailyCapCents", "monthlyCapCents", "spentDay", "spentTodayCents", "spentMonthCents", "stripeCustomerId"], LIBRARIES),
        insert("families", ["id", "name"], [FAMILY]),
        insert("members", ["id", "familyId", "name", "role", "age", "bandMin", "bandMax", "email"], MEMBERS),
        insert("cards", ["id", "familyId", "libraryId", "label"], CARDS),
        insert("titles", ["id", "title", "author", "series", "seriesNo", "minAge", "maxAge", "themes", "color",
                          "pages", "releaseDate", "ratingPct", "ratingCount"], TITLES),
        insert("copies", ["titleId", "libraryId", "owned", "available", "queue", "asOf", "ppuCents", "onOrder"], COPIES),
        insert("holds", ["id", "familyId", "memberId", "titleId", "libraryId", "position", "status", "createdAt"], HOLDS),
        insert("borrows", ["id", "familyId", "memberId", "titleId", "libraryId", "kind", "borrowedAt", "finishedAt", "minutesRead",
                           "costCents", "currentPage", "lastReadAt"], BORROWS),
        insert("reactions", ["id", "borrowId", "memberId", "reaction", "at"], REACTIONS),
        insert("sessions", ["id", "clientId", "borrowId", "memberId", "day", "minutes", "toPage", "at"], SESSIONS),
        insert("tbr", ["memberId", "titleId", "addedBy", "source", "addedAt"], TBR),
        insert("shelves", ["id", "name", "minAge", "maxAge", "curator"], SHELVES),
        insert("shelf_titles", ["shelfId", "titleId", "position"],
               [{"shelfId": s["id"], "titleId": t, "position": i} for s in SHELVES for i, t in enumerate(s["titleIds"])]),
        insert("follows", ["memberId", "kind", "value"], FOLLOWS),
        insert("meetups", ["id", "title", "kind", "author", "series", "venue", "venueKind", "address", "startsAt", "endsAt",
                           "minAge", "maxAge", "capacity", "seatsTaken", "priceCents", "description"], MEETUPS),
        "COMMIT;",
    ]
    (ROOT / "db" / "002_seed.sql").write_text("\n\n".join(parts) + "\n")
    print("Wrote data/seed.json and db/002_seed.sql")


if __name__ == "__main__":
    main()
