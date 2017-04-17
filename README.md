# Storage Metrics

## The Problem
How do I get Azure Storage metrics (both Classic and ARM) with only READER rights on the subscription.

## The Hack
It turns out there is a Microsoft.Insights endpoint for an older API version that generates readonly SAS tokens specifically for the metrics tables:
https://management.azure.com/subscriptions/%7bsubscription-id%7d/resourceGroups/%7bresource-group-name%7d/providers/Microsoft.Storage/storageAccounts/%7bstorage-account-name%7d/services/table/providers/microsoft.insights/metricDefinitions?api-version=2015-07-01

**THIS IS A HACK UNTIL THE AZURE MONITOR API SUPPORTS STORAGE LATER THIS YEAR, THIS IS NOT SUPPORTED**

Then the problem is that calls to /metricDefinitions is throttled to 100 / 5 min (in practise I saw some variation in this, but it is a tight limit regardless).

Here’s how it works, every so often it:

1. Get a list of all storage accounts (Classic and ARM)
2. Get some of the metric definitions (configurable, but 20 at a time; 60 total because there are definitions for blob, table, and queue)
3. Get metrics for everything that has a definition

## Configuration

* Create a Azure AD Web App and grant it READER rights on the subscription.
* Rename the config/sample.default.json to config/default.json.
* Put all the connectivity information into the config/default.json file.

## Execution

* node index.js
