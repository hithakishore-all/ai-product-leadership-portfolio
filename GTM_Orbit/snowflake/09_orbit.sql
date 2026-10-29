-- =====================================================================
-- GTM AI demo · 09 GTM Orbit support objects
--   ACCOUNT_CONTACTS_V   every contact with permitted / opted-out / incomplete flags
--                        (powers "discover missing contacts" in the web console and Slack)
--   SET_OWNER_SLACK_ID   maps the account owner to the first Slack user who uses Orbit
-- =====================================================================
USE ROLE ACCOUNTADMIN;
-- @@
CREATE OR REPLACE VIEW GTM_DEMO.APP.ACCOUNT_CONTACTS_V AS
SELECT
  a.ACCOUNT_NUMBER AS ACCOUNT_KEY,
  c.ID AS CONTACT_ID,
  TRIM(COALESCE(c.FIRST_NAME, '') || ' ' || c.LAST_NAME) AS NAME,
  c.TITLE,
  c.EMAIL,
  CASE
    WHEN c.TITLE IS NULL THEN NULL
    WHEN ' ' || c.TITLE || ' ' ILIKE ANY ('% IT %', '%Technology%', '%Architecture%', '%Engineering%') THEN 'technical_evaluator'
    WHEN c.TITLE ILIKE ANY ('%Finance%', '%Financial%', '%Controller%', '%CFO%') THEN 'economic_buyer'
    WHEN c.TITLE ILIKE ANY ('Chief%', 'SVP%', 'VP%', '%Vice President%') THEN 'executive_sponsor'
    WHEN c.TITLE ILIKE ANY ('%Director%', '%Head of%', '%Manager%', '%Lead%') THEN 'champion'
  END AS ROLE_HYPOTHESIS,
  COALESCE(c.HAS_OPTED_OUT_OF_EMAIL, FALSE) AS OPTED_OUT,
  COALESCE(c.DO_NOT_CALL, FALSE) AS DO_NOT_CALL,
  (COALESCE(c.HAS_OPTED_OUT_OF_EMAIL, FALSE) = FALSE AND c.EMAIL IS NOT NULL) AS PERMITTED,
  (c.EMAIL IS NULL OR c.TITLE IS NULL) AS INCOMPLETE
FROM GTM_DEMO.RAW_SFDC.CONTACT c
JOIN GTM_DEMO.RAW_SFDC.ACCOUNT a ON a.ID = c.ACCOUNT_ID
WHERE a.ACCOUNT_NUMBER LIKE 'GTM-%';
-- @@
GRANT SELECT ON VIEW GTM_DEMO.APP.ACCOUNT_CONTACTS_V TO ROLE GTM_APP_RW;
-- @@
CREATE OR REPLACE PROCEDURE GTM_DEMO.APP.SET_OWNER_SLACK_ID(SLACK_USER_ID VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
BEGIN
  UPDATE GTM_DEMO.APP.AE_DIRECTORY SET SLACK_USER_ID = :SLACK_USER_ID WHERE SLACK_USER_ID IS NULL;
  RETURN 'owner mapped';
END;
$$;
-- @@
GRANT USAGE ON PROCEDURE GTM_DEMO.APP.SET_OWNER_SLACK_ID(VARCHAR) TO ROLE GTM_APP_RW;
