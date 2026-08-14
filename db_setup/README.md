# Database setup

Supabase/Postgres resources are grouped by how they are used:

```text
db_setup/
├── schema/      # Complete baseline for a new project
├── upgrades/    # Version-to-version upgrades for older installations
├── patches/     # Ordered changes for existing installations
├── optional/    # SQL required only by optional features
└── audits/      # Access contract and deployed-policy records
```

Do not run every SQL file on every database. Choose the path that matches the
installation below.

## Fresh install

Run [`schema/tms_full_schema_v12.sql`](./schema/tms_full_schema_v12.sql) once in
the Supabase SQL Editor. It creates the current tables, constraints, indexes,
helper functions, audit trigger, grants, and Row-Level Security policies in one
transaction.

Then follow the bootstrap step in the root
[README](../README.md#5-create-the-first-platform-admin) to grant the first
platform administrator access.

The baseline already contains the existing-install changes in `patches/`. Do
not run those files on a fresh install.

If AI translation will be enabled, also follow [Optional AI usage
controls](#optional-ai-usage-controls).

## Existing v11 install

First run [`upgrades/tms_acl_v12.sql`](./upgrades/tms_acl_v12.sql) once. This
upgrades the legacy v11 access model to v12, including per-language access and
conversion of legacy `editor` and `viewer` memberships to `member`.

After that succeeds, apply the existing-install patches below in order. Do not
run the v11 upgrade on a fresh install.

## Existing v12 install: patch order

Apply only patches not already recorded for the target database, in this order:

1. [`patches/tms_final_admin_guard.sql`](./patches/tms_final_admin_guard.sql) — enforce the final-platform-admin guarantee and make admin mutations server-only.
2. [`patches/tms_global_access_directory.sql`](./patches/tms_global_access_directory.sql) — add the service-role-only platform-admin and membership operation.
3. [`patches/tms_authenticated_data_access.sql`](./patches/tms_authenticated_data_access.sql) — remove anonymous application-table access and restrict project creation.
4. [`patches/tms_disable_graphql.sql`](./patches/tms_disable_graphql.sql) — remove the unused `pg_graphql` extension. Skip this only if the deployment deliberately uses Supabase GraphQL.
5. [`patches/tms_harden_authorization_helper_execution.sql`](./patches/tms_harden_authorization_helper_execution.sql) — remove anonymous execution of authorization helpers.
6. [`patches/tms_translation_scope_integrity.sql`](./patches/tms_translation_scope_integrity.sql) — enforce same-project translation key and language scope.
7. [`patches/tms_translation_history_trigger.sql`](./patches/tms_translation_history_trigger.sql) — protect audit-history creation for direct translation updates.
8. [`patches/tms_least_privilege_data_api.sql`](./patches/tms_least_privilege_data_api.sql) — replace broad table privileges with the operations Glotter uses and make future exposure opt-in.
9. [`patches/tms_owner_membership_visibility.sql`](./patches/tms_owner_membership_visibility.sql) — let project owners read membership rows they are authorized to manage.

Each patch is intended to be applied once. Review its header and run it in the
Supabase SQL Editor. For a production database, create and verify a manual
backup before applying changes; see the [backup guide](../docs/operations/manual-supabase-backups.md).

## Optional AI usage controls

Run [`optional/tms_ai_usage_controls.sql`](./optional/tms_ai_usage_controls.sql)
once before setting `AI_USAGE_LIMITS_ENABLED=true`. It adds private hourly
usage counters, expiring concurrency leases, and service-role-only functions
that reserve and release capacity across serverless instances.

The rest of Glotter works without this file. AI translation can run without the
database controls only while `AI_USAGE_LIMITS_ENABLED=false`.

## Audit references

- [`audits/access_matrix.md`](./audits/access_matrix.md) defines the intended authorization contract.
- [`audits/rls_policy_inventory.md`](./audits/rls_policy_inventory.md) records the deployed RLS audit and its validation history.
