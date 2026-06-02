# Database setup

SQL for the Supabase/Postgres backend.

## Fresh install — run this

**[`tms_full_schema_v12.sql`](./tms_full_schema_v12.sql)** is the clean-install
baseline. It creates every table, constraint, index, helper function, the audit
trigger, and all Row-Level Security policies in a single transaction.

Run it once against a new Supabase project (SQL Editor → paste → Run), then
follow the bootstrap step in the root [README](../README.md#5-create-the-first-platform-admin)
to grant yourself admin access.

## Existing v11 install — migration only

**[`tms_acl_v12.sql`](./tms_acl_v12.sql)** is a one-time **migration** that
upgrades an older v11 database to the v12 per-language access model (adds
columns, rewrites policies, converts legacy `editor`/`viewer` roles to
`member`).

**Do not run this on a fresh install** — `tms_full_schema_v12.sql` already
includes everything in it. It's kept here only for upgrading a pre-existing
deployment.
