-- =====================================================================
-- GTM AI demo · 03 views: the agent input contract
-- Agents read ONE view: GTM_DEMO.APP.ACCOUNT_CONTEXT_V. Every evidence item carries
-- ref_id, source, ts, excerpt (and url when there is one).
-- Run as ACCOUNTADMIN after the data is loaded (or before; views are lazy).
-- =====================================================================
USE ROLE ACCOUNTADMIN;
USE WAREHOUSE GTM_DEMO_WH;
USE DATABASE GTM_DEMO;

-- ---------------------------------------------------------------------
-- Contact readiness. Role is a HYPOTHESIS from title; the Identifier agent
-- confirms it. Permitted = not opted out of email AND has an email.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW GTM_DEMO.APP.CONTACT_READINESS_V AS
WITH c AS (
  SELECT
    ct.ACCOUNT_ID,
    ct.ID AS CONTACT_ID,
    TRIM(COALESCE(ct.FIRST_NAME, '') || ' ' || ct.LAST_NAME) AS CONTACT_NAME,
    ct.TITLE,
    ct.EMAIL,
    COALESCE(ct.HAS_OPTED_OUT_OF_EMAIL, FALSE) AS OPTED_OUT,
    (COALESCE(ct.HAS_OPTED_OUT_OF_EMAIL, FALSE) = FALSE AND ct.EMAIL IS NOT NULL) AS IS_PERMITTED,
    (ct.EMAIL IS NULL OR ct.TITLE IS NULL) AS IS_INCOMPLETE,
    CASE
      WHEN ct.TITLE IS NULL THEN NULL
      WHEN ' ' || ct.TITLE || ' ' ILIKE ANY ('% IT %', '%Technology%', '%Architecture%', '%Engineering%')
        THEN 'technical_evaluator'
      WHEN ct.TITLE ILIKE ANY ('%Finance%', '%Financial%', '%Controller%', '%CFO%')
        THEN 'economic_buyer'
      WHEN ct.TITLE ILIKE ANY ('Chief%', 'SVP%', 'VP%', '%Vice President%')
        THEN 'executive_sponsor'
      WHEN ct.TITLE ILIKE ANY ('%Director%', '%Head of%', '%Manager%', '%Lead%')
        THEN 'champion'
    END AS ROLE_HYPOTHESIS
  FROM GTM_DEMO.RAW_SFDC.CONTACT ct
)
SELECT
  a.ID AS SALESFORCE_ACCOUNT_ID,
  COUNT(c.CONTACT_ID)                                             AS CONTACTS_TOTAL,
  COUNT_IF(c.IS_PERMITTED)                                        AS CONTACTS_PERMITTED,
  COUNT_IF(c.OPTED_OUT)                                           AS OPTED_OUT_COUNT,
  COUNT_IF(c.IS_INCOMPLETE)                                       AS INCOMPLETE_RECORDS,
  COUNT(DISTINCT IFF(c.IS_PERMITTED, c.ROLE_HYPOTHESIS, NULL))    AS ROLES_COVERED,
  4                                                               AS ROLES_TOTAL,
  ARRAY_EXCEPT(
    ARRAY_CONSTRUCT('champion', 'economic_buyer', 'technical_evaluator', 'executive_sponsor'),
    ARRAY_AGG(DISTINCT IFF(c.IS_PERMITTED, c.ROLE_HYPOTHESIS, NULL))
  )                                                               AS MISSING_ROLES,
  ARRAY_AGG(IFF(c.IS_PERMITTED,
                OBJECT_CONSTRUCT('contact_id', c.CONTACT_ID, 'name', c.CONTACT_NAME, 'title', c.TITLE,
                                 'email', c.EMAIL, 'role_hypothesis', c.ROLE_HYPOTHESIS),
                NULL))                                            AS PERMITTED_CONTACTS
FROM GTM_DEMO.RAW_SFDC.ACCOUNT a
LEFT JOIN c ON c.ACCOUNT_ID = a.ID
GROUP BY a.ID;

-- ---------------------------------------------------------------------
-- Evidence: one row per citable fact, from every source
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW GTM_DEMO.APP.EVIDENCE_V AS
WITH cfg AS (SELECT * FROM GTM_DEMO.APP.DEMO_CONFIG LIMIT 1),
keys AS (SELECT ID AS SFID, ACCOUNT_NUMBER AS ACCOUNT_KEY FROM GTM_DEMO.RAW_SFDC.ACCOUNT WHERE ACCOUNT_NUMBER LIKE 'GTM-%'),

opps AS (
  SELECT o.ACCOUNT_ID AS SALESFORCE_ACCOUNT_ID,
         'SF-OPP-' || o.ID AS REF_ID, 'Salesforce' AS SOURCE,
         IFF(o.IS_CLOSED, o.CLOSE_DATE::TIMESTAMP_NTZ, o.LAST_MODIFIED_DATE) AS TS,
         'Opportunity · ' || o.NAME || ' · ' || o.STAGE_NAME || ' · $' || TRIM(TO_VARCHAR(o.AMOUNT, '999,999,999'))
           || IFF(o.NEXT_STEP IS NOT NULL, ' · next step: ' || o.NEXT_STEP, '') AS EXCERPT,
         NULL::VARCHAR AS URL
  FROM GTM_DEMO.RAW_SFDC.OPPORTUNITY o CROSS JOIN cfg
  WHERE NOT o.IS_CLOSED OR o.CLOSE_DATE >= DATEADD(day, -365, cfg.AS_OF_DATE)
),

cases AS (
  SELECT cs.ACCOUNT_ID, 'SF-CASE-' || cs.CASE_NUMBER, 'Salesforce', cs.LAST_MODIFIED_DATE,
         'Case · ' || cs.STATUS || ' · ' || cs.PRIORITY || ' priority · ' || cs.SUBJECT, NULL::VARCHAR
  FROM GTM_DEMO.RAW_SFDC.CASES cs
),

gong AS (
  SELECT k.SFID, h.CALL_ID || '#' || h.UTTERANCE_NUM, 'Gong', cl.CALL_DATE::TIMESTAMP_NTZ,
         'Tracker: ' || LISTAGG(DISTINCT h.TRACKER, ', ') || ' · ' || TO_VARCHAR(cl.CALL_DATE, 'Mon DD')
           || ' call · "' || ANY_VALUE(h.SNIPPET) || '"',
         ANY_VALUE(cl.CALL_URL)
  FROM GTM_DEMO.RAW_GONG.TRACKER_HITS h
  JOIN GTM_DEMO.RAW_GONG.CALLS cl ON cl.CALL_ID = h.CALL_ID
  JOIN keys k ON k.ACCOUNT_KEY = cl.ACCOUNT_KEY
  CROSS JOIN cfg
  WHERE cl.CALL_DATE >= DATEADD(day, -cfg.GONG_LOOKBACK_DAYS, cfg.AS_OF_DATE)
  GROUP BY k.SFID, h.CALL_ID, h.UTTERANCE_NUM, cl.CALL_DATE
),

-- Missing calls are UNKNOWN, not negative: say so explicitly
gong_none AS (
  SELECT k.SFID, 'GONG-none', 'Gong', cfg.AS_OF_DATE::TIMESTAMP_NTZ,
         'No calls in the last ' || cfg.GONG_LOOKBACK_DAYS || ' days (unknown, not negative)', NULL::VARCHAR
  FROM keys k CROSS JOIN cfg
  WHERE NOT EXISTS (
    SELECT 1 FROM GTM_DEMO.RAW_GONG.CALLS cl
    WHERE cl.ACCOUNT_KEY = k.ACCOUNT_KEY
      AND cl.CALL_DATE >= DATEADD(day, -cfg.GONG_LOOKBACK_DAYS, cfg.AS_OF_DATE))
),

usage AS (
  SELECT k.SFID, 'SNOW-USG-' || REPLACE(u.ACCOUNT_KEY, 'GTM-', ''), 'Snowflake', u.MONTH::TIMESTAMP_NTZ,
         'Seat usage at ' || ROUND(100 * u.SEATS_ACTIVE / u.SEATS_PURCHASED) || '% of plan ('
           || u.SEATS_ACTIVE || ' of ' || u.SEATS_PURCHASED || ' seats), '
           || IFF(u.SEATS_ACTIVE >= u.PREV3, 'up ', 'down ') || ABS(u.SEATS_ACTIVE - u.PREV3)
           || ' seats over 3 months', NULL::VARCHAR
  FROM (
    SELECT *, LAG(SEATS_ACTIVE, 3) OVER (PARTITION BY ACCOUNT_KEY ORDER BY MONTH) AS PREV3
    FROM GTM_DEMO.SIGNALS.PRODUCT_USAGE_MONTHLY
    QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_KEY ORDER BY MONTH DESC) = 1
  ) u
  JOIN keys k ON k.ACCOUNT_KEY = u.ACCOUNT_KEY
),

intent AS (
  SELECT k.SFID, 'INTENT-' || REPLACE(i.ACCOUNT_KEY, 'GTM-', '') || '-' || UPPER(REPLACE(i.TOPIC, ' ', '_')),
         'Intent', i.WEEK_START::TIMESTAMP_NTZ,
         'Intent: "' || i.TOPIC || '" at ' || i.INTENSITY || '/100, from ' || i.PREV4 || ' four weeks earlier',
         NULL::VARCHAR
  FROM (
    SELECT *, LAG(INTENSITY, 4) OVER (PARTITION BY ACCOUNT_KEY, TOPIC ORDER BY WEEK_START) AS PREV4
    FROM GTM_DEMO.SIGNALS.INTENT_SIGNALS_WEEKLY
    QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_KEY, TOPIC ORDER BY WEEK_START DESC) = 1
  ) i
  JOIN keys k ON k.ACCOUNT_KEY = i.ACCOUNT_KEY
),

events AS (
  SELECT k.SFID, 'EVT-' || REPLACE(e.ACCOUNT_KEY, 'GTM-', '') || '-' || TO_VARCHAR(e.EVENT_DATE, 'YYYYMMDD'),
         'Signals', e.EVENT_DATE::TIMESTAMP_NTZ, e.EVENT_TYPE || ' · ' || e.DESCRIPTION, NULL::VARCHAR
  FROM GTM_DEMO.SIGNALS.CRITICAL_EVENTS e
  JOIN keys k ON k.ACCOUNT_KEY = e.ACCOUNT_KEY
)

SELECT * FROM opps
UNION ALL SELECT * FROM cases
UNION ALL SELECT * FROM gong
UNION ALL SELECT * FROM gong_none
UNION ALL SELECT * FROM usage
UNION ALL SELECT * FROM intent
UNION ALL SELECT * FROM events;

-- ---------------------------------------------------------------------
-- ACCOUNT_CONTEXT_V: the ONLY thing agents read
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW GTM_DEMO.APP.ACCOUNT_CONTEXT_V AS
SELECT
  a.ID                AS SALESFORCE_ACCOUNT_ID,
  a.ACCOUNT_NUMBER    AS ACCOUNT_KEY,
  a.NAME              AS ACCOUNT_NAME,
  a.INDUSTRY,
  a.TYPE              AS ACCOUNT_TYPE,
  d.REGION,
  a.OWNER_ID,
  a.OWNER_NAME,
  a.OWNER_EMAIL,
  s.PRIORITY_SCORE,                         -- NULL = unscored, never "low"
  s.SCORE_VERSION,
  s.SCORED_AT,
  s.SCORE_RATIONALE,
  s.FEATURE_STATUS,
  DATEDIFF(day, s.SCORED_AT, cfg.AS_OF_DATE) AS SCORE_AGE_DAYS,
  CASE WHEN s.PRIORITY_SCORE IS NULL THEN 'unscored'
       WHEN DATEDIFF(day, s.SCORED_AT, cfg.AS_OF_DATE) > cfg.STALE_AFTER_DAYS THEN 'stale'
       ELSE 'fresh' END AS SCORE_FRESHNESS,
  g.GROWTH_VECTOR,
  q.SEQUENCE_IDS      AS ALLOWED_SEQUENCES,
  OBJECT_CONSTRUCT(
    'roles_covered', r.ROLES_COVERED, 'roles_total', r.ROLES_TOTAL, 'missing_roles', r.MISSING_ROLES,
    'contacts_total', r.CONTACTS_TOTAL, 'contacts_permitted', r.CONTACTS_PERMITTED,
    'opted_out_count', r.OPTED_OUT_COUNT, 'incomplete_records', r.INCOMPLETE_RECORDS,
    'permitted_contacts', r.PERMITTED_CONTACTS
  ) AS CONTACT_READINESS,
  e.EVIDENCE
FROM GTM_DEMO.RAW_SFDC.ACCOUNT a
CROSS JOIN (SELECT * FROM GTM_DEMO.APP.DEMO_CONFIG LIMIT 1) cfg
LEFT JOIN GTM_DEMO.APP.DEMO_ACCOUNTS d        ON d.ACCOUNT_KEY = a.ACCOUNT_NUMBER
LEFT JOIN GTM_DEMO.SCORING.PRIORITY_SCORES s  ON s.ACCOUNT_KEY = a.ACCOUNT_NUMBER
LEFT JOIN GTM_DEMO.SCORING.GROWTH_VECTOR g    ON g.ACCOUNT_KEY = a.ACCOUNT_NUMBER
LEFT JOIN GTM_DEMO.APP.CONTACT_READINESS_V r  ON r.SALESFORCE_ACCOUNT_ID = a.ID
LEFT JOIN (SELECT GROWTH_VECTOR, ARRAY_AGG(SEQUENCE_ID) AS SEQUENCE_IDS
           FROM GTM_DEMO.APP.SEQUENCES GROUP BY GROWTH_VECTOR) q ON q.GROWTH_VECTOR = g.GROWTH_VECTOR
LEFT JOIN (SELECT SALESFORCE_ACCOUNT_ID,
                  ARRAY_AGG(OBJECT_CONSTRUCT('ref_id', REF_ID, 'source', SOURCE, 'ts', TS,
                                             'excerpt', EXCERPT, 'url', URL))
                    WITHIN GROUP (ORDER BY TS DESC) AS EVIDENCE
           FROM GTM_DEMO.APP.EVIDENCE_V GROUP BY SALESFORCE_ACCOUNT_ID) e ON e.SALESFORCE_ACCOUNT_ID = a.ID
WHERE a.ACCOUNT_NUMBER LIKE 'GTM-%';  -- ignore the sample accounts a new Salesforce org ships with

-- ---------------------------------------------------------------------
-- The daily Slack queue
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW GTM_DEMO.APP.RANKED_QUEUE_V AS
SELECT
  ROW_NUMBER() OVER (ORDER BY PRIORITY_SCORE DESC NULLS LAST) AS QUEUE_RANK,
  SALESFORCE_ACCOUNT_ID, ACCOUNT_KEY, ACCOUNT_NAME, INDUSTRY, REGION, OWNER_ID, OWNER_EMAIL,
  PRIORITY_SCORE, SCORE_VERSION, SCORE_FRESHNESS, SCORE_AGE_DAYS, SCORE_RATIONALE, FEATURE_STATUS,
  GROWTH_VECTOR,
  CONTACT_READINESS:roles_covered::NUMBER AS ROLES_COVERED,
  CONTACT_READINESS:missing_roles         AS MISSING_ROLES
FROM GTM_DEMO.APP.ACCOUNT_CONTEXT_V;

GRANT SELECT ON VIEW GTM_DEMO.APP.ACCOUNT_CONTEXT_V TO ROLE GTM_AGENT_RO;
GRANT SELECT ON VIEW GTM_DEMO.APP.ACCOUNT_CONTEXT_V TO ROLE GTM_APP_RW;
GRANT SELECT ON VIEW GTM_DEMO.APP.RANKED_QUEUE_V    TO ROLE GTM_APP_RW;
