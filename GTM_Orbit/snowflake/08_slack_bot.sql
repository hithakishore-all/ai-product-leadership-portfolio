-- =====================================================================
-- GTM AI demo · 08 Slack bot access
-- A service user (no password, key-pair only) that has just GTM_APP_RW:
-- read the queue / context / trace views and call the flow procedures.
-- The public key comes from .keys/gtm_slack_bot.pub (private key stays on your Mac).
-- =====================================================================
USE ROLE ACCOUNTADMIN;
-- @@
CREATE USER IF NOT EXISTS GTM_SLACK_BOT
  TYPE = SERVICE
  DEFAULT_ROLE = GTM_APP_RW
  DEFAULT_WAREHOUSE = GTM_DEMO_WH
  COMMENT = 'GTM AI demo Slack app (Socket Mode). Key-pair auth only.';
-- @@
ALTER USER GTM_SLACK_BOT SET RSA_PUBLIC_KEY = '<paste the contents of .keys/gtm_slack_bot.pub without the BEGIN/END lines>';
-- @@
GRANT ROLE GTM_APP_RW TO USER GTM_SLACK_BOT;
-- @@
-- Lets /gtm-reset clear demo runs between recordings (runs as owner; only touches run history)
CREATE OR REPLACE PROCEDURE GTM_DEMO.APP.RESET_DEMO()
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
BEGIN
  DELETE FROM GTM_DEMO.APP.AUDIT_EVENTS;
  DELETE FROM GTM_DEMO.APP.AE_DECISIONS;
  DELETE FROM GTM_DEMO.APP.PROCESSED_ACTIONS;
  DELETE FROM GTM_DEMO.APP.FLOW_RUNS;
  RETURN 'reset';
END;
$$;
-- @@
GRANT USAGE ON PROCEDURE GTM_DEMO.APP.RESET_DEMO() TO ROLE GTM_APP_RW;
