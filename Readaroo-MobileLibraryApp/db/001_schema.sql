-- Readaroo schema (Postgres 14+). Safe to re-run: drops and recreates the readaroo tables.
-- Run as a database owner:  psql "$DATABASE_URL" -f db/001_schema.sql

DROP TABLE IF EXISTS events, meter_events, feedback, reactions, approvals, sessions, rsvps, meetups, follows, tbr, shelf_titles, shelves, borrows, holds, copies, titles, cards, members, families, libraries, app_config CASCADE;

CREATE TABLE app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE libraries (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  daily_cap_cents    integer NOT NULL CHECK (daily_cap_cents >= 0),
  monthly_cap_cents  integer NOT NULL CHECK (monthly_cap_cents >= 0),
  spent_day          date NOT NULL,
  spent_today_cents  integer NOT NULL DEFAULT 0 CHECK (spent_today_cents >= 0),
  spent_month_cents  integer NOT NULL DEFAULT 0 CHECK (spent_month_cents >= 0),
  stripe_customer_id text,
  CHECK (spent_today_cents <= daily_cap_cents),
  CHECK (spent_month_cents <= monthly_cap_cents)
);

CREATE TABLE families (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE members (
  id        text PRIMARY KEY,
  family_id text NOT NULL REFERENCES families(id),
  name      text NOT NULL,
  role      text NOT NULL CHECK (role IN ('parent', 'kid')),
  age       integer,
  band_min  integer,
  band_max  integer,
  email     text
);

CREATE TABLE cards (
  id         text PRIMARY KEY,
  family_id  text NOT NULL REFERENCES families(id),
  library_id text NOT NULL REFERENCES libraries(id),
  label      text NOT NULL
);

CREATE TABLE titles (
  id        text PRIMARY KEY,
  title     text NOT NULL,
  author    text NOT NULL,
  series    text,
  series_no integer,
  min_age   integer,            -- NULL = reading level unknown
  max_age   integer,
  themes    text[] NOT NULL DEFAULT '{}',
  color     text NOT NULL,
  pages        integer NOT NULL,
  release_date date NOT NULL,
  rating_pct   integer,           -- synthetic "loved by readers this age"; NULL = not enough ratings
  rating_count integer NOT NULL DEFAULT 0
);

CREATE TABLE copies (
  title_id   text NOT NULL REFERENCES titles(id),
  library_id text NOT NULL REFERENCES libraries(id),
  owned      integer NOT NULL,
  available  integer NOT NULL,
  queue      integer NOT NULL,
  as_of      timestamptz NOT NULL,
  ppu_cents  integer,           -- NULL = no pay-per-use rights here
  on_order   integer NOT NULL DEFAULT 0,   -- copies ordered for a title not yet released
  PRIMARY KEY (title_id, library_id)
);

CREATE TABLE holds (
  id         text PRIMARY KEY,
  family_id  text NOT NULL REFERENCES families(id),
  member_id  text NOT NULL REFERENCES members(id),
  title_id   text NOT NULL REFERENCES titles(id),
  library_id text NOT NULL REFERENCES libraries(id),
  position   integer NOT NULL,
  status     text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE borrows (
  id           text PRIMARY KEY,
  family_id    text NOT NULL REFERENCES families(id),
  member_id    text NOT NULL REFERENCES members(id),
  title_id     text NOT NULL REFERENCES titles(id),
  library_id   text NOT NULL REFERENCES libraries(id),
  kind         text NOT NULL CHECK (kind IN ('standard', 'instant')),
  borrowed_at  timestamptz NOT NULL,
  finished_at  timestamptz,
  minutes_read integer NOT NULL DEFAULT 0,
  cost_cents   integer NOT NULL DEFAULT 0,
  current_page integer NOT NULL DEFAULT 0,
  last_read_at timestamptz
);

-- One row per reading session; client_id makes a repeated save (e.g. on closing the page) idempotent
CREATE TABLE sessions (
  id        text PRIMARY KEY,
  client_id text NOT NULL UNIQUE,
  borrow_id text NOT NULL REFERENCES borrows(id),
  member_id text NOT NULL REFERENCES members(id),
  day       date NOT NULL,
  minutes   integer NOT NULL CHECK (minutes BETWEEN 1 AND 600),
  to_page   integer,
  at        timestamptz NOT NULL
);

CREATE TABLE tbr (
  member_id text NOT NULL REFERENCES members(id),
  title_id  text NOT NULL REFERENCES titles(id),
  added_by  text NOT NULL REFERENCES members(id),
  source    text NOT NULL,
  added_at  timestamptz NOT NULL,
  PRIMARY KEY (member_id, title_id)
);

CREATE TABLE shelves (
  id      text PRIMARY KEY,
  name    text NOT NULL,
  min_age integer NOT NULL,
  max_age integer NOT NULL,
  curator text NOT NULL
);

CREATE TABLE shelf_titles (
  shelf_id text NOT NULL REFERENCES shelves(id),
  title_id text NOT NULL REFERENCES titles(id),
  position integer NOT NULL,
  PRIMARY KEY (shelf_id, title_id)
);

CREATE TABLE follows (
  member_id text NOT NULL REFERENCES members(id),
  kind      text NOT NULL CHECK (kind IN ('author', 'series')),
  value     text NOT NULL,
  PRIMARY KEY (member_id, kind, value)
);

CREATE TABLE meetups (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  kind        text NOT NULL,
  author      text,
  series      text,
  venue       text NOT NULL,
  venue_kind  text NOT NULL,
  address     text NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  min_age     integer NOT NULL,
  max_age     integer NOT NULL,
  capacity    integer NOT NULL,
  seats_taken integer NOT NULL DEFAULT 0,
  price_cents integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  CHECK (seats_taken <= capacity)
);

CREATE TABLE rsvps (
  id           text PRIMARY KEY,
  meetup_id    text NOT NULL REFERENCES meetups(id),
  family_id    text NOT NULL REFERENCES families(id),
  attendees    text[] NOT NULL,
  status       text NOT NULL CHECK (status IN ('going', 'waitlist', 'requested', 'cancelled')),
  requested_by text NOT NULL,
  created_at   timestamptz NOT NULL
);

CREATE TABLE approvals (
  id           text PRIMARY KEY,
  family_id    text NOT NULL REFERENCES families(id),
  member_id    text NOT NULL REFERENCES members(id),
  title_id     text NOT NULL REFERENCES titles(id),
  reason       text NOT NULL,
  status       text NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  scope        text,
  requested_at timestamptz NOT NULL,
  decided_at   timestamptz,
  decided_by   text
);

CREATE TABLE reactions (
  id        text PRIMARY KEY,
  borrow_id text NOT NULL REFERENCES borrows(id),
  member_id text NOT NULL REFERENCES members(id),
  reaction  text NOT NULL CHECK (reaction IN ('loved', 'ok', 'not_for_me')),
  at        timestamptz NOT NULL
);

CREATE TABLE feedback (
  id                 text PRIMARY KEY,
  member_id          text NOT NULL REFERENCES members(id),
  held_title_id      text NOT NULL,
  suggested_title_id text NOT NULL,
  vote               text NOT NULL CHECK (vote IN ('up', 'down')),
  at                 timestamptz NOT NULL
);

CREATE TABLE meter_events (
  idempotency_key text PRIMARY KEY,
  library_id      text NOT NULL REFERENCES libraries(id),
  value_cents     integer NOT NULL,
  stripe_id       text NOT NULL,
  mode            text NOT NULL,
  at              timestamptz NOT NULL
);

-- Append-only audit trail
CREATE TABLE events (
  seq       bigserial PRIMARY KEY,
  id        text NOT NULL UNIQUE,
  family_id text,
  actor     text NOT NULL,
  type      text NOT NULL,
  data      jsonb NOT NULL DEFAULT '{}',
  at        timestamptz NOT NULL
);

-- Least-privilege app role (created once; the app connects as this role).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readaroo_app') THEN
    CREATE ROLE readaroo_app LOGIN;
  END IF;
END $$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readaroo_app;
GRANT INSERT, UPDATE ON holds, borrows, approvals, reactions, feedback, meter_events, copies, libraries, sessions, rsvps, meetups TO readaroo_app;
GRANT INSERT, DELETE ON tbr, follows TO readaroo_app;
GRANT INSERT ON events TO readaroo_app;
GRANT USAGE ON SEQUENCE events_seq_seq TO readaroo_app;
REVOKE UPDATE, DELETE ON events FROM readaroo_app;
