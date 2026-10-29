-- Conviction AI · Postgres data model, shaped like Salesforce
--
-- Standard Salesforce objects (same name and meaning as in Salesforce):
--   account, contact, opportunity, opportunity_field_history, task, content_document
-- Custom objects (end in __c, as in Salesforce) hold what a CRM doesn't do:
--   fund__c, segment__c, account_segment__c, funding_round__c, round_participant__c,
--   evidence_claim__c, customer_arr__c
-- Columns use snake_case: stage_name here is StageName in Salesforce.
-- All demo records are synthetic.

-- Start clean every time: drop everything in this database's public schema and rebuild.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------- Custom: funds and market segments ----------

CREATE TABLE fund__c (
  id        TEXT PRIMARY KEY,                     -- 'f2'
  name      TEXT NOT NULL,                        -- 'Fund II · Growth'
  strategy  TEXT NOT NULL CHECK (strategy IN ('Growth VC', 'PE Buyout'))
);

CREATE TABLE segment__c (
  id                 TEXT PRIMARY KEY,            -- 'po'
  name               TEXT NOT NULL,               -- 'Physical Operations AI'
  short_name         TEXT NOT NULL,
  adoption           SMALLINT NOT NULL CHECK (adoption BETWEEN 0 AND 100),
  funding            SMALLINT NOT NULL CHECK (funding BETWEEN 0 AND 100),
  tech               SMALLINT NOT NULL CHECK (tech BETWEEN 0 AND 100),
  talent             SMALLINT NOT NULL CHECK (talent BETWEEN 0 AND 100),
  whitespace         SMALLINT NOT NULL CHECK (whitespace BETWEEN 0 AND 100),
  catalysts          SMALLINT NOT NULL CHECK (catalysts BETWEEN 0 AND 100),
  evidence_coverage  NUMERIC(4,3) NOT NULL,       -- share of signals backed by observed data
  tam_mid_usd_b      NUMERIC(8,2),
  narrative          TEXT,
  contrary           TEXT                         -- the strongest evidence against
);

-- ---------- Standard: Account and Contact ----------

-- One table for every organization, told apart by record type, exactly like Salesforce.
CREATE TABLE account (
  id                   SERIAL PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,      -- 'helioops' (used in URLs)
  name                 TEXT NOT NULL UNIQUE,
  record_type          TEXT NOT NULL CHECK (record_type IN ('Startup', 'PE Target', 'Investor')),
  description          TEXT,
  billing_city         TEXT,
  number_of_employees  INTEGER,
  company_stage        TEXT,                      -- 'Series B'
  sub_segment          TEXT,                      -- 'Workflow Execution'
  website              TEXT,
  founded_year         INTEGER,
  billing_country      TEXT,
  is_synthetic         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE contact (
  id               SERIAL PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  title            TEXT,                          -- 'CEO'
  domain_evidence  TEXT,                          -- founder-domain fit, with its evidence
  evidence_status  TEXT NOT NULL DEFAULT 'missing'
);

-- ---------- Custom: market intelligence ----------

-- A company can sit in several segments; exactly one is primary, so funding is never double counted.
CREATE TABLE account_segment__c (
  account_id  INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  segment_id  TEXT    NOT NULL REFERENCES segment__c(id),
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (account_id, segment_id)
);
CREATE UNIQUE INDEX one_primary_segment ON account_segment__c (account_id) WHERE is_primary;

CREATE TABLE funding_round__c (
  id            TEXT PRIMARY KEY,                 -- 'r01'
  account_id    INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  segment_id    TEXT    NOT NULL REFERENCES segment__c(id),
  stage         TEXT    NOT NULL,                 -- 'Series A'
  quarter       TEXT    NOT NULL,                 -- '2026 Q3'
  amount_usd_m  NUMERIC(12,2) NOT NULL CHECK (amount_usd_m >= 0),
  source        TEXT    NOT NULL DEFAULT 'synthetic'
);
CREATE INDEX funding_round_segment ON funding_round__c (segment_id, quarter);

-- Junction: which investor Accounts joined which round.
CREATE TABLE round_participant__c (
  round_id             TEXT    NOT NULL REFERENCES funding_round__c(id) ON DELETE CASCADE,
  investor_account_id  INTEGER NOT NULL REFERENCES account(id),
  PRIMARY KEY (round_id, investor_account_id)
);

-- ---------- Evidence ----------

-- Standard: uploaded files (Salesforce Files), linked to an Account.
CREATE TABLE content_document (
  id            SERIAL PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,                    -- file name
  file_type     TEXT NOT NULL,                    -- 'Pitch deck', 'Cohort export', ...
  created_date  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Custom: every fact is a claim with a source and a status. Conflicting claims are kept side by side.
CREATE TABLE evidence_claim__c (
  id           TEXT PRIMARY KEY,                  -- 'cl-nrr-claim'
  account_id   INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                     -- 'Net revenue retention (claimed)'
  value_text   TEXT,
  status       TEXT NOT NULL CHECK (status IN
                 ('verified','calculated','company','third','inferred','assumption','missing','disputed')),
  locator      TEXT,                              -- 'HelioOps_SeriesB_Deck.pdf · slide 12'
  is_critical  BOOLEAN NOT NULL DEFAULT FALSE,
  resolution   TEXT,                              -- set by a human reviewer
  note         TEXT,                              -- why this status, what would change it
  source_title TEXT,                              -- e.g. 'Munich Startup · ClearOps raises €8.6 million'
  source_url   TEXT,                              -- the page the fact came from
  retrieved_date DATE,                            -- when it was read
  last_modified_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Custom: customer-level ARR for the opening cohort. NRR/GRR are always recomputed from these rows.
CREATE TABLE customer_arr__c (
  id                   SERIAL PRIMARY KEY,
  account_id           INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  content_document_id  INTEGER REFERENCES content_document(id) ON DELETE SET NULL,
  row_number           INTEGER NOT NULL,          -- row in the source file, for traceability
  customer             TEXT NOT NULL,
  opening_arr_k        NUMERIC(14,2) NOT NULL CHECK (opening_arr_k >= 0),
  ending_arr_k         NUMERIC(14,2) NOT NULL CHECK (ending_arr_k >= 0)
);
CREATE INDEX customer_arr_account ON customer_arr__c (account_id);

-- ---------- Standard: Opportunity (the deal), its history, and tasks ----------

CREATE TABLE opportunity (
  id                  TEXT PRIMARY KEY,           -- 'd1'
  account_id          INTEGER NOT NULL REFERENCES account(id),
  fund_id             TEXT NOT NULL REFERENCES fund__c(id),
  name                TEXT NOT NULL,              -- 'HelioOps · Series B · $14M'
  round_label         TEXT,
  amount_usd_m        NUMERIC(12,2),              -- check size when known
  stage_name          TEXT NOT NULL CHECK (stage_name IN
                        ('Identified','Initial Screen','Qualified','Diligence','Partner Review','IC','Closed / Passed')),
  owner_name          TEXT,
  flag                TEXT,                       -- open diligence exception
  last_modified_date  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same idea as Salesforce field history tracking: every stage change is recorded.
CREATE TABLE opportunity_field_history (
  id              SERIAL PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunity(id) ON DELETE CASCADE,
  field           TEXT NOT NULL DEFAULT 'StageName',
  old_value       TEXT,
  new_value       TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_date    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Diligence tasks are standard Tasks; what_id points at the Opportunity, as in Salesforce.
CREATE TABLE task (
  id            SERIAL PRIMARY KEY,
  what_id       TEXT NOT NULL REFERENCES opportunity(id) ON DELETE CASCADE,
  subject       TEXT NOT NULL,
  owner_name    TEXT,
  status        TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Completed')),
  description   TEXT,                             -- decision impact
  created_date  TIMESTAMPTZ NOT NULL DEFAULT now()
);
