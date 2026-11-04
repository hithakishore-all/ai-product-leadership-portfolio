# Changelog

## 0.3.0 — 2026-11-03

- New light, kid-friendly look: sky-wash background, grape and sunshine colors, chunky buttons, bigger kid mode
- Roo the kangaroo mascot (original artwork) on home screens, empty states and the app icon
- Animations: bouncy page entrances, hopping Roo, popping streak dots, confetti on wins; all off with reduced motion
- Phone layout with a bottom tab bar and a More screen
- Payments screen (was Library): how the money moves, Stripe usage charges with an invoice preview, budgets
- Installable web app: manifest, icons, offline service worker, Install app button, app shortcuts
- Native iOS and Android app setup with Capacitor 6.2.3 (`npm run mobile:android`, `npm run mobile:ios`)
- docs/MOBILE.md

## 0.2.0 — 2026-11-03

- Want-to-read lists per person, and librarian shelves by age group (kids also see the next level up)
- Reader that tracks page and time and saves when you leave mid-chapter; idempotent by session id
- Streaks: 5 minutes a day counts, one rest day a week, 14-day calendar, badges, no-blame fresh starts
- Good picks with reasons from loves, finishes, lists and follows
- New arrivals, coming soon, follows, and holds before release day
- Author talks, signings, storytimes and book clubs: family matching, kid requests, grown-up rule, waitlists, calendar invites
- Digest now counts reading sessions and shows streaks
- 16 more tests, including parallel bookings on Postgres

## 0.1.0 — 2026-11-03

First prototype.

- Next-Up read-alikes for held books, with reasons and exclusions
- One holds list across library cards, routed to the shortest line
- Kid profiles with age bands, kid requests and parent approvals (title or series)
- Library-funded instant borrows with daily and monthly caps, metered in Stripe test mode
- Weekly family digest with kid reactions and conversation starters
- Offline mode, live Postgres mode, single-file HTML demo
- End-to-end smoke tests and an optional live Postgres test
