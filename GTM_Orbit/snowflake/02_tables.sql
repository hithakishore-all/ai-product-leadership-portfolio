-- =====================================================================
-- GTM AI demo · 02 tables
-- Run as ACCOUNTADMIN after 01_setup.sql. Safe to re-run (CREATE OR REPLACE
-- wipes data; scripts/load_snowflake.py reloads it).
-- =====================================================================
USE ROLE ACCOUNTADMIN;
USE WAREHOUSE GTM_DEMO_WH;
USE DATABASE GTM_DEMO;

-- ---------------------------------------------------------------------
-- RAW_SFDC: mirror of the Salesforce org (loaded by scripts/load_snowflake.py
-- from `sf data query`). ACCOUNT_NUMBER (GTM-0001...) is the demo join key.
-- ---------------------------------------------------------------------
CREATE OR REPLACE TABLE GTM_DEMO.RAW_SFDC.ACCOUNT (
  ID                  VARCHAR(18) PRIMARY KEY,
  NAME                VARCHAR,
  ACCOUNT_NUMBER      VARCHAR,
  INDUSTRY            VARCHAR,
  TYPE                VARCHAR,
  BILLING_CITY        VARCHAR,
  BILLING_STATE       VARCHAR,
  BILLING_COUNTRY     VARCHAR,
  NUMBER_OF_EMPLOYEES NUMBER,
  ANNUAL_REVENUE      NUMBER(18,2),
  WEBSITE             VARCHAR,
  DESCRIPTION         VARCHAR,
  OWNER_ID            VARCHAR(18),
  OWNER_NAME          VARCHAR,
  OWNER_EMAIL         VARCHAR,
  LAST_MODIFIED_DATE  TIMESTAMP_NTZ,
  _LOADED_AT          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE TABLE GTM_DEMO.RAW_SFDC.CONTACT (
  ID                     VARCHAR(18) PRIMARY KEY,
  ACCOUNT_ID             VARCHAR(18),
  FIRST_NAME             VARCHAR,
  LAST_NAME              VARCHAR,
  TITLE                  VARCHAR,
  DEPARTMENT             VARCHAR,
  EMAIL                  VARCHAR,
  PHONE                  VARCHAR,
  HAS_OPTED_OUT_OF_EMAIL BOOLEAN,
  DO_NOT_CALL            BOOLEAN,
  LAST_MODIFIED_DATE     TIMESTAMP_NTZ,
  _LOADED_AT             TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE TABLE GTM_DEMO.RAW_SFDC.OPPORTUNITY (
  ID                 VARCHAR(18) PRIMARY KEY,
  ACCOUNT_ID         VARCHAR(18),
  NAME               VARCHAR,
  STAGE_NAME         VARCHAR,
  TYPE               VARCHAR,
  AMOUNT             NUMBER(18,2),
  PROBABILITY        NUMBER,
  CLOSE_DATE         DATE,
  NEXT_STEP          VARCHAR,
  IS_CLOSED          BOOLEAN,
  IS_WON             BOOLEAN,
  LAST_MODIFIED_DATE TIMESTAMP_NTZ,
  _LOADED_AT         TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- CASE is a reserved word, so the table is CASES
CREATE OR REPLACE TABLE GTM_DEMO.RAW_SFDC.CASES (
  ID                 VARCHAR(18) PRIMARY KEY,
  ACCOUNT_ID         VARCHAR(18),
  CONTACT_ID         VARCHAR(18),
  CASE_NUMBER        VARCHAR,
  SUBJECT            VARCHAR,
  DESCRIPTION        VARCHAR,
  STATUS             VARCHAR,
  PRIORITY           VARCHAR,
  ORIGIN             VARCHAR,
  CREATED_DATE       TIMESTAMP_NTZ,
  LAST_MODIFIED_DATE TIMESTAMP_NTZ,
  _LOADED_AT         TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- ---------------------------------------------------------------------
-- RAW_GONG (simulated). Keyed by ACCOUNT_KEY, resolved to Salesforce IDs in APP views.
-- ---------------------------------------------------------------------
CREATE OR REPLACE TABLE GTM_DEMO.RAW_GONG.CALLS (
  CALL_ID      VARCHAR PRIMARY KEY,
  ACCOUNT_KEY  VARCHAR,
  CALL_DATE    DATE,
  TITLE        VARCHAR,
  DURATION_MIN NUMBER,
  DIRECTION    VARCHAR,
  CALL_URL     VARCHAR
);

CREATE OR REPLACE TABLE GTM_DEMO.RAW_GONG.CALL_PARTICIPANTS (
  CALL_ID          VARCHAR,
  PARTICIPANT_NAME VARCHAR,
  AFFILIATION      VARCHAR,
  SIDE             VARCHAR      -- Internal / External
);

CREATE OR REPLACE TABLE GTM_DEMO.RAW_GONG.TRANSCRIPT_UTTERANCES (
  CALL_ID       VARCHAR,
  UTTERANCE_NUM NUMBER,
  START_SEC     NUMBER,
  SPEAKER       VARCHAR,
  TEXT          VARCHAR
);

CREATE OR REPLACE TABLE GTM_DEMO.RAW_GONG.TRACKER_HITS (
  CALL_ID       VARCHAR,
  UTTERANCE_NUM NUMBER,
  TRACKER       VARCHAR,       -- Integration, Competitor, Pricing, Churn risk, Timeline, ...
  SNIPPET       VARCHAR
);

-- ---------------------------------------------------------------------
-- SIGNALS
-- ---------------------------------------------------------------------
CREATE OR REPLACE TABLE GTM_DEMO.SIGNALS.PRODUCT_USAGE_MONTHLY (
  ACCOUNT_KEY      VARCHAR,
  MONTH            DATE,
  SEATS_PURCHASED  NUMBER,
  SEATS_ACTIVE     NUMBER,
  ACTIVE_WORKFLOWS NUMBER
);

CREATE OR REPLACE TABLE GTM_DEMO.SIGNALS.INTENT_SIGNALS_WEEKLY (
  ACCOUNT_KEY VARCHAR,
  WEEK_START  DATE,
  TOPIC       VARCHAR,
  INTENSITY   NUMBER,          -- 0-100
  SOURCE      VARCHAR
);

CREATE OR REPLACE TABLE GTM_DEMO.SIGNALS.CRITICAL_EVENTS (
  ACCOUNT_KEY VARCHAR,
  EVENT_TYPE  VARCHAR,
  EVENT_DATE  DATE,
  DESCRIPTION VARCHAR,
  SOURCE      VARCHAR
);

-- ---------------------------------------------------------------------
-- SCORING (model-owned). NULL score = unscored, never "low".
-- ---------------------------------------------------------------------
CREATE OR REPLACE TABLE GTM_DEMO.SCORING.PRIORITY_SCORES (
  ACCOUNT_KEY     VARCHAR PRIMARY KEY,
  PRIORITY_SCORE  FLOAT,
  SCORE_VERSION   VARCHAR,
  SCORED_AT       TIMESTAMP_NTZ,
  SCORE_RATIONALE VARCHAR,
  FEATURE_STATUS  VARIANT        -- {"EWGS":"present","INTENT":"present",...,"PTB_ROP":"unscored"}
);

CREATE OR REPLACE TABLE GTM_DEMO.SCORING.GROWTH_VECTOR (
  ACCOUNT_KEY   VARCHAR PRIMARY KEY,
  GROWTH_VECTOR VARCHAR          -- kept separate from priority
);

-- ---------------------------------------------------------------------
-- APP: config, reference data, flow state and audit
-- ---------------------------------------------------------------------
CREATE OR REPLACE TABLE GTM_DEMO.APP.DEMO_CONFIG (
  AS_OF_DATE            DATE,     -- the demo's "today"; keeps recency windows stable for recordings
  STALE_AFTER_DAYS      NUMBER,
  GONG_LOOKBACK_DAYS    NUMBER
);
INSERT INTO GTM_DEMO.APP.DEMO_CONFIG VALUES ('2026-10-23', 3, 90);

CREATE OR REPLACE TABLE GTM_DEMO.APP.DEMO_ACCOUNTS (
  ACCOUNT_KEY  VARCHAR PRIMARY KEY,
  ACCOUNT_NAME VARCHAR,
  REGION       VARCHAR,
  DEMO_STORY   VARCHAR
);

CREATE OR REPLACE TABLE GTM_DEMO.APP.SEQUENCES (
  SEQUENCE_ID   VARCHAR PRIMARY KEY,
  SEQUENCE_NAME VARCHAR,
  GROWTH_VECTOR VARCHAR,
  TOUCHES       NUMBER,
  DESCRIPTION   VARCHAR
);

-- Maps the Salesforce owner to a Slack user so only the owner can accept/approve
CREATE OR REPLACE TABLE GTM_DEMO.APP.AE_DIRECTORY (
  SF_USER_ID    VARCHAR(18),
  SF_USER_EMAIL VARCHAR,
  AE_NAME       VARCHAR,
  SLACK_USER_ID VARCHAR
);

CREATE OR REPLACE TABLE GTM_DEMO.APP.FLOW_RUNS (
  FLOW_ID        VARCHAR PRIMARY KEY,
  ACCOUNT_ID     VARCHAR(18),
  STATE          VARCHAR,   -- received, validated, context_loaded, crew_running, validating, awaiting_ae, approved, rejected, failed
  SCORE_VERSION  VARCHAR,
  RETRIES        NUMBER DEFAULT 0,
  DRAFT_VERSION  NUMBER DEFAULT 0,
  CURRENT_DRAFT  VARCHAR,
  PACKAGE        VARIANT,   -- sequence, contacts, cited facts, claim map, validator result
  SLACK_CHANNEL  VARCHAR,
  SLACK_TS       VARCHAR,
  CREATED_AT     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  UPDATED_AT     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE TABLE GTM_DEMO.APP.AUDIT_EVENTS (
  EVENT_ID      VARCHAR DEFAULT UUID_STRING(),
  FLOW_ID       VARCHAR,
  EVENT         VARCHAR,   -- e.g. crew.validator.failed
  TS            TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  ACCOUNT_ID    VARCHAR(18),
  SCORE_VERSION VARCHAR,
  ACTOR         VARCHAR,   -- agent:validator, user:U0123, system:flow
  DURATION_MS   NUMBER,
  DETAIL        VARIANT
);

CREATE OR REPLACE TABLE GTM_DEMO.APP.AE_DECISIONS (
  FLOW_ID        VARCHAR,
  ACCOUNT_ID     VARCHAR(18),
  DECISION       VARCHAR,   -- accepted, deferred, rejected_recommendation, approved, rejected_package, edited
  SLACK_USER_ID  VARCHAR,
  DRAFT_VERSION  NUMBER,
  SCORE_VERSION  VARCHAR,
  FINAL_TEXT     VARCHAR,
  REASON         VARCHAR,
  DECIDED_AT     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Idempotency: flow_id + action_id seen once
CREATE OR REPLACE TABLE GTM_DEMO.APP.PROCESSED_ACTIONS (
  IDEMPOTENCY_KEY VARCHAR PRIMARY KEY,
  SEEN_AT         TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

GRANT SELECT, INSERT, UPDATE ON TABLE GTM_DEMO.APP.FLOW_RUNS         TO ROLE GTM_APP_RW;
GRANT SELECT, INSERT         ON TABLE GTM_DEMO.APP.AUDIT_EVENTS      TO ROLE GTM_APP_RW;
GRANT SELECT, INSERT         ON TABLE GTM_DEMO.APP.AE_DECISIONS      TO ROLE GTM_APP_RW;
GRANT SELECT, INSERT         ON TABLE GTM_DEMO.APP.PROCESSED_ACTIONS TO ROLE GTM_APP_RW;
GRANT SELECT                 ON TABLE GTM_DEMO.APP.AE_DIRECTORY      TO ROLE GTM_APP_RW;
GRANT SELECT                 ON TABLE GTM_DEMO.APP.SEQUENCES         TO ROLE GTM_APP_RW;
