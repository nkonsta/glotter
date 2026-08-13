# Deployed RLS Policy Inventory

This is a read-only snapshot of the RLS configuration deployed to the Glotter
Supabase project. It is the baseline for the Slice 4 security audit; it is not a
proposed policy design.

- Captured: 2026-08-13
- Supabase project: `Glotter` (`zigbulclexcpwqxiglph`)
- PostgreSQL: 17
- Source: `pg_catalog.pg_class` and `pg_catalog.pg_policies`
- Database changes made while capturing this snapshot: none

## Summary

All nine application tables in `public` have RLS enabled and do not force RLS
for table owners. There are 22 permissive policies. Every policy applies to
`PUBLIC`, so its expression—not its target-role list—is the authorization
boundary.

| Table | RLS | Forced | Policies |
| --- | --- | --- | ---: |
| `platform_admins` | enabled | no | 1 |
| `project_activity_log` | enabled | no | 2 |
| `project_invites` | enabled | no | 2 |
| `project_languages` | enabled | no | 2 |
| `project_members` | enabled | no | 4 |
| `projects` | enabled | no | 4 |
| `translation_history` | enabled | no | 1 |
| `translation_keys` | enabled | no | 2 |
| `translations` | enabled | no | 4 |

`WITH CHECK` below reports what is explicitly stored in the deployed policy.
For an `ALL` or `UPDATE` policy without an explicit `WITH CHECK`, PostgreSQL may
reuse its `USING` expression for new rows. The audit will test effective
behavior rather than infer it from catalog text alone.

## Policies

### `platform_admins`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `admins_view_admins` | SELECT | PUBLIC | `is_platform_admin()` | — |

Direct `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` privileges have separately
been revoked from `anon` and `authenticated`. Those grants are not RLS policies.

### `project_activity_log`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `insert_activity_log` | INSERT | PUBLIC | — | `is_project_member(project_id)` |
| `view_activity_log` | SELECT | PUBLIC | `is_project_member(project_id)` | — |

### `project_invites`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `owners_manage_invites` | ALL | PUBLIC | `is_project_owner(project_id)` | — |
| `view_project_invites` | SELECT | PUBLIC | `is_project_owner(project_id)` | — |

### `project_languages`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `owners_manage_languages` | ALL | PUBLIC | `is_project_owner(project_id)` | — |
| `view_project_languages` | SELECT | PUBLIC | `is_project_member(project_id)` | — |

### `project_members`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `owners_delete_members` | DELETE | PUBLIC | `is_project_owner(project_id)` | — |
| `owners_manage_members` | INSERT | PUBLIC | — | `is_project_owner(project_id)` |
| `owners_update_members` | UPDATE | PUBLIC | `is_project_owner(project_id)` | — |
| `view_project_members` | SELECT | PUBLIC | `user_id = auth.uid() OR is_platform_admin()` | — |

### `projects`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `owners_delete_projects` | DELETE | PUBLIC | `is_project_owner(id)` | — |
| `owners_insert_projects` | INSERT | PUBLIC | — | `true` |
| `owners_update_projects` | UPDATE | PUBLIC | `is_project_owner(id)` | — |
| `view_own_projects` | SELECT | PUBLIC | `is_project_member(id)` | — |

### `translation_history`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `view_translation_history` | SELECT | PUBLIC | membership in the translation's project via `is_project_member(...)` | — |

Exact deployed `USING` expression:

```sql
EXISTS (
  SELECT 1
  FROM translations t
  JOIN translation_keys tk ON tk.id = t.key_id
  WHERE t.id = translation_history.translation_id
    AND is_project_member(tk.project_id)
)
```

### `translation_keys`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `owners_manage_keys` | ALL | PUBLIC | `is_project_owner(project_id)` | — |
| `view_translation_keys` | SELECT | PUBLIC | `is_project_member(project_id)` | — |

### `translations`

| Policy | Command | Roles | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `delete_translations` | DELETE | PUBLIC | owner of the key's project via `is_project_owner(...)` | — |
| `edit_translations` | UPDATE | PUBLIC | editable key/project-language combination via `can_edit_language(...)` | — |
| `insert_translations` | INSERT | PUBLIC | — | editable key/project-language combination via `can_edit_language(...)` |
| `view_translations` | SELECT | PUBLIC | viewable key/project-language combination via `can_view_language(...)` | — |

Exact deployed expressions:

```sql
-- delete_translations: USING
EXISTS (
  SELECT 1
  FROM translation_keys tk
  WHERE tk.id = translations.key_id
    AND is_project_owner(tk.project_id)
)

-- edit_translations: USING
EXISTS (
  SELECT 1
  FROM translation_keys tk
  JOIN project_languages pl ON pl.id = translations.project_language_id
  WHERE tk.id = translations.key_id
    AND can_edit_language(tk.project_id, pl.language_code)
)

-- insert_translations: WITH CHECK
EXISTS (
  SELECT 1
  FROM translation_keys tk
  JOIN project_languages pl ON pl.id = translations.project_language_id
  WHERE tk.id = translations.key_id
    AND can_edit_language(tk.project_id, pl.language_code)
)

-- view_translations: USING
EXISTS (
  SELECT 1
  FROM translation_keys tk
  JOIN project_languages pl ON pl.id = translations.project_language_id
  WHERE tk.id = translations.key_id
    AND can_view_language(tk.project_id, pl.language_code)
)
```

## Authorization helpers used by policies

| Function | Security | Effective `EXECUTE` roles | Purpose |
| --- | --- | --- | --- |
| `is_platform_admin()` | DEFINER, stable | PUBLIC, `anon`, `authenticated`, `service_role` | Checks `platform_admins` for `auth.uid()` |
| `is_project_member(uuid)` | DEFINER, stable | PUBLIC, `anon`, `authenticated`, `service_role` | Checks membership or platform-admin status |
| `is_project_owner(uuid)` | DEFINER, stable | PUBLIC, `anon`, `authenticated`, `service_role` | Checks owner membership or platform-admin status |
| `can_view_language(uuid, text)` | DEFINER, stable | PUBLIC, `anon`, `authenticated`, `service_role` | Checks language view access |
| `can_edit_language(uuid, text)` | DEFINER, stable | PUBLIC, `anon`, `authenticated`, `service_role` | Checks language edit access |

All five helpers are owned by `postgres`, have an empty pinned `search_path`,
and are directly callable through the exposed `public` schema. Whether that
direct RPC exposure is intentional remains an audit question; no change is
proposed by this inventory.

## Separate object-grant baseline

RLS policies only apply after PostgreSQL object privileges allow an operation.
The deployed grants are therefore recorded separately:

- `anon`, `authenticated`, and `service_role` currently have effective
  `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` privileges on every
  application table except `platform_admins`.
- On `platform_admins`, `anon` and `authenticated` have only `SELECT`;
  `service_role` has all of the privileges above.
- `anon`, `authenticated`, and `service_role` have `USAGE` on `public`.
- Default privileges for new `public` tables, sequences, and functions currently
  grant broad access to `anon`, `authenticated`, and `service_role`.

These grants do not mean every row operation succeeds: RLS still governs
supported row-level commands. They do mean that the grant layer itself is
permissive and must be included in the audit.

## Deployed migration history

The Supabase migration registry currently contains:

1. `20260602172506_harden_security_definer_search_path`
2. `20260813113031_atomic_final_admin_guard`
3. `20260813115050_global_access_directory_admin_operation`

## Checked-in reconciliation

- The deployed 22-policy set matches `db_setup/tms_full_schema_v12.sql`, the
  documented fresh-install baseline.
- `translation-mgmt-prd_v12.md` is not a current policy source: it still lists
  the removed `admins_manage_admins` policy and predates the deployed helper
  hardening. The final-admin safeguard intentionally removed that policy and
  revoked direct client mutations of `platform_admins`.
- `db_setup/tms_acl_v12.sql` is a historical v11-to-v12 upgrade script, not the
  deployed-state baseline.

## Read-only effective-access checks

The following checks used `SET ROLE` plus simulated JWT claims and performed
only `SELECT` statements. No project or application row was created, updated,
or deleted.

| Tested caller | Projects | Memberships | Languages | Keys | Translations | History |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `anon` | 0 | 0 | 0 | 0 | 0 | 0 |
| Authenticated non-member | 0 | 0 | 0 | 0 | 0 | 0 |
| Existing member sample | 1 | 1 | 29 | 1,002 | 1,994 | 74 |
| Existing owner sample | 2 | 2 | 6 | 3,633 | 7,489 | 457 |
| Existing platform-admin sample | 10 | 3 | 61 | 13,246 | 37,111 | 545 |

The sampled member and owner were non-admin accounts. The platform-admin counts
match the total deployed row counts. These results support the expected read
boundaries but do not yet validate write operations.

## Security Advisor snapshot

The 2026-08-13 security-advisor run returned 29 warnings:

| Warning | Count | Scope |
| --- | ---: | --- |
| `pg_graphql_anon_table_exposed` | 9 | Every application table |
| `pg_graphql_authenticated_table_exposed` | 9 | Every application table |
| `anon_security_definer_function_executable` | 5 | The five authorization helpers above |
| `authenticated_security_definer_function_executable` | 5 | The five authorization helpers above |
| `auth_leaked_password_protection` | 1 | Supabase Auth configuration |

These are findings to classify, not automatic instructions to change policies.
The repository contains no GraphQL client calls, but `pg_graphql` is installed
in the deployed database. The browser does directly call `is_platform_admin()`;
the other four helpers are referenced by RLS policies.

## Confirmed intended behavior

The following decisions were confirmed after capturing this baseline:

- Only platform admins may create projects.
- Anonymous application-data access is not supported. A caller must sign in and
  have project access to read or mutate project data; platform admins retain
  global access.
- GraphQL usage is unknown. The extension and authenticated GraphQL exposure
  will not be changed without a separate decision.

## Approved correction applied

Migration `20260813122003_restrict_authenticated_data_access` was applied on
2026-08-13. It made two focused changes:

- `owners_insert_projects` now targets `authenticated` and requires
  `is_platform_admin()`.
- All table privileges on the nine application tables were revoked from
  `anon`; the existing authenticated grants and other 21 policies were left
  unchanged.

Post-change rollback-safe checks confirmed:

- `anon` cannot select from an application table at the grant layer.
- An authenticated non-admin cannot insert a project.
- An authenticated platform admin can insert a project.
- The validation transaction left zero test rows.

The post-change Security Advisor run no longer reports any anonymous GraphQL
table exposure. It still reports authenticated GraphQL exposure for the nine
tables, direct execution of five authorization helpers, and leaked-password
protection being disabled. Those findings were not changed in this correction.

## GraphQL decision

The application does not use GraphQL, the previous 24 hours of API logs showed
no GraphQL traffic, and no application database object depended on
`pg_graphql`. Disabling the extension was therefore approved as a separate,
reversible change. See `tms_disable_graphql.sql`.

Migration `20260813122742_disable_unused_graphql` was applied on 2026-08-13.
Post-change verification confirmed that `pg_graphql` and `graphql.resolve` no
longer exist, all nine public tables and all 22 RLS policies remain in place,
and the retained Supabase endpoint wrapper responds that the extension is not
enabled. The Security Advisor now reports no anonymous or authenticated
GraphQL table-exposure warnings.

## Authorization-helper audit

The five `SECURITY DEFINER` authorization helpers were reviewed separately.
Each helper:

- is a stable, read-only Boolean function;
- derives the caller only from `auth.uid()` and does not accept a user ID;
- uses fully qualified table/function names and an empty pinned `search_path`;
- contains no dynamic SQL and performs no mutation; and
- returns only the caller's effective admin, membership, ownership, or language
  permission for a supplied project/language—not project or account data.

Direct-call tests produced the expected results:

| Caller | Result |
| --- | --- |
| Anonymous | All five checks returned `false` |
| Authenticated non-member | All five checks returned `false` |
| Existing member | Member/view/edit matched only the assigned project and permissions; owner/admin were `false` |
| Existing owner | Member/owner/view/edit were `true` for an owned project and `false` for another project |
| Platform admin | All five checks returned `true` for a sampled project |

`SECURITY DEFINER` is necessary for these helpers to read the protected
`platform_admins` and `project_members` tables without recursive RLS evaluation.
Changing them to `SECURITY INVOKER` is not a safe advisor-only correction.

The remaining concern is API exposure. `is_platform_admin()` is intentionally
called by the dashboard. The other four helpers are called only by RLS policies,
but the `authenticated` role needs `EXECUTE` for those policies to work. Moving
them into a non-exposed schema could hide their RPC endpoints, but would require
a broad rewrite of policy/function references. No authorization bypass was
found that justifies that higher-risk rewrite.

Migration `20260813123826_harden_authorization_helper_execution` was applied on
2026-08-13. It revoked direct execution of the five helpers from `PUBLIC` and
`anon`, while explicitly retaining `EXECUTE` for `authenticated` and
`service_role`. It did not change any function body or RLS policy.

Post-change rollback-safe checks confirmed that:

- `anon` cannot execute any of the five helpers;
- `authenticated` and `service_role` can execute all five helpers;
- an existing member can still read their project and update a translation in
  an assigned edit language;
- an existing owner can still update their project;
- an existing platform admin can still call `is_platform_admin()` and create a
  project; and
- the validation transaction left zero test projects.

The Security Advisor now reports six warnings: five signed-in execution
warnings for these intentionally authenticated RLS helpers, plus the separate
leaked-password-protection setting. The five anonymous helper warnings are
resolved. The signed-in warnings are accepted for the current design because
revoking that access would break the dashboard call and RLS evaluation.
