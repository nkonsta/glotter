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

## Existing v12 install — final-admin safeguard

Run **[`tms_final_admin_guard.sql`](./tms_final_admin_guard.sql)** once to make
the final-platform-admin guarantee atomic and database-enforced. The patch also
removes direct client mutations of `platform_admins`; administrative server code
using the service role remains able to grant and revoke access.

## Existing v12 install — global access directory

Run **[`tms_global_access_directory.sql`](./tms_global_access_directory.sql)**
once before deploying the global access directory. It adds the service-role-only
operation used to grant or revoke platform-admin access and to atomically remove
project memberships when that is explicitly selected during demotion.

## Existing v12 install — authenticated data access

Run **[`tms_authenticated_data_access.sql`](./tms_authenticated_data_access.sql)**
once to restrict project creation to authenticated platform admins and remove
anonymous Data API privileges from all application tables. Existing
authenticated access remains governed by the established RLS policies.

## Existing install — disable unused GraphQL

Run **[`tms_disable_graphql.sql`](./tms_disable_graphql.sql)** once when Glotter
does not use Supabase's GraphQL endpoint. It removes only the `pg_graphql`
extension; the REST Data API, Auth, and RLS policies are unaffected.

## Existing v12 install — authorization-helper execution

Run
**[`tms_harden_authorization_helper_execution.sql`](./tms_harden_authorization_helper_execution.sql)**
once to remove anonymous execution of the five RLS authorization helpers while
retaining the authenticated and service-role execution required by the app and
its policies.
