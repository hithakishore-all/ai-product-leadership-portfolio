#!/bin/bash
# Exports the GTM demo records from Salesforce to CSV files in salesforce/export/
# so they can be loaded into Snowflake (RAW_SFDC). Uses your `sf` login (alias gtm-demo).
set -e
cd "$(dirname "$0")/.."
mkdir -p salesforce/export
ORG="${SF_TARGET_ORG:-gtm-demo}"
W="Account.AccountNumber LIKE 'GTM-%'"
q() { sf data query --target-org "$ORG" --result-format csv --query "$2" > "salesforce/export/$1.csv"; echo "  $1: $(($(wc -l < salesforce/export/$1.csv) - 1)) rows"; }
echo "Exporting from Salesforce..."
q Account     "SELECT Id, Name, AccountNumber, Industry, Type, BillingCity, BillingState, BillingCountry, NumberOfEmployees, AnnualRevenue, Website, Description, OwnerId, Owner.Name, Owner.Email, LastModifiedDate FROM Account WHERE AccountNumber LIKE 'GTM-%'"
q Contact     "SELECT Id, AccountId, FirstName, LastName, Title, Department, Email, Phone, HasOptedOutOfEmail, DoNotCall, LastModifiedDate FROM Contact WHERE $W"
q Opportunity "SELECT Id, AccountId, Name, StageName, Type, Amount, Probability, CloseDate, NextStep, IsClosed, IsWon, LastModifiedDate FROM Opportunity WHERE $W"
q Case        "SELECT Id, AccountId, ContactId, CaseNumber, Subject, Description, Status, Priority, Origin, CreatedDate, LastModifiedDate FROM Case WHERE $W"
echo "Done. Next: python3 scripts/build_sfdc_sql.py"
