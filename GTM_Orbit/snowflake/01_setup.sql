-- =====================================================================
-- GTM AI demo · 01 setup: warehouse, database, schemas, roles
-- Run in a Snowsight worksheet as ACCOUNTADMIN (trial accounts have it).
-- =====================================================================
USE ROLE ACCOUNTADMIN;

-- Small warehouse that suspends after 60s so the trial credits last
CREATE WAREHOUSE IF NOT EXISTS GTM_DEMO_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;

CREATE DATABASE IF NOT EXISTS GTM_DEMO;
USE DATABASE GTM_DEMO;

CREATE SCHEMA IF NOT EXISTS GTM_DEMO.RAW_SFDC   COMMENT = 'Salesforce mirror (system of record), keyed by 18-char Salesforce IDs';
CREATE SCHEMA IF NOT EXISTS GTM_DEMO.RAW_GONG   COMMENT = 'Simulated Gong: calls, participants, transcripts, tracker hits';
CREATE SCHEMA IF NOT EXISTS GTM_DEMO.SIGNALS    COMMENT = 'Warehouse-only signals: product usage, intent, critical events';
CREATE SCHEMA IF NOT EXISTS GTM_DEMO.SCORING    COMMENT = 'Owned by the scoring model. Agents read, never write or recompute';
CREATE SCHEMA IF NOT EXISTS GTM_DEMO.INSIGHTS   COMMENT = 'Conversational Insights (Cortex enrichment) - phase 2';
CREATE SCHEMA IF NOT EXISTS GTM_DEMO.APP        COMMENT = 'Agent contract views, flow state, audit trail';

-- Roles from the architecture: agents get one read-only view; the app gets state/audit writes.
CREATE ROLE IF NOT EXISTS GTM_AGENT_RO COMMENT = 'CrewAI agents: SELECT on GTM_DEMO.APP.ACCOUNT_CONTEXT_V only';
CREATE ROLE IF NOT EXISTS GTM_APP_RW   COMMENT = 'Flow + Slack app: read contract views, write flow state and audit events';
GRANT ROLE GTM_AGENT_RO TO ROLE SYSADMIN;
GRANT ROLE GTM_APP_RW   TO ROLE SYSADMIN;

SET me = '"' || CURRENT_USER() || '"';   -- quoted: usernames can be lowercase or emails
GRANT ROLE GTM_AGENT_RO TO USER IDENTIFIER($me);
GRANT ROLE GTM_APP_RW   TO USER IDENTIFIER($me);

GRANT USAGE ON WAREHOUSE GTM_DEMO_WH TO ROLE GTM_AGENT_RO;
GRANT USAGE ON WAREHOUSE GTM_DEMO_WH TO ROLE GTM_APP_RW;
GRANT USAGE ON DATABASE GTM_DEMO TO ROLE GTM_AGENT_RO;
GRANT USAGE ON DATABASE GTM_DEMO TO ROLE GTM_APP_RW;
GRANT USAGE ON SCHEMA GTM_DEMO.APP TO ROLE GTM_AGENT_RO;
GRANT USAGE ON SCHEMA GTM_DEMO.APP TO ROLE GTM_APP_RW;

