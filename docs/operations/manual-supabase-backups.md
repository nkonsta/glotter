# Manual Supabase backups

Glotter currently uses manual logical database dumps. Backup automation is
deliberately deferred until the desired schedule, retention, and storage
location are agreed.

Supabase recommends that Free Plan projects regularly export their data with
`supabase db dump` and keep the result off-site. This procedure follows the
official [database backup](https://supabase.com/docs/guides/platform/backups)
and [CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
guides.

## What this protects

The three dumps capture database roles, schema, and data. Keep all three files
from a run together.

Database dumps do **not** contain the actual files uploaded through the
Supabase Storage API. They contain database metadata about those objects only.
If Glotter begins using Storage, add a separate object-download procedure and
test it alongside this database backup.

## Prerequisites

Install and start:

- the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started);
- [Docker Desktop](https://docs.docker.com/desktop/), which the CLI uses to run `pg_dump`;
- PostgreSQL's `psql` client before performing a restore.

Confirm the tools before a backup:

```bash
supabase --version
docker info
```

This repository does not install or pin the Supabase CLI as an npm dependency.
Use `supabase db dump --help` to check the flags supported by the installed CLI
before the first run or after upgrading it.

## Get the connection string

Open the Supabase project dashboard and choose **Connect**.

- Prefer the **Session pooler** connection string on port `5432`.
- Use the **direct connection** string on port `5432` when the machine has IPv6 connectivity, or when the project has the IPv4 add-on.
- Do not use transaction mode for dump or restore work.

Replace the password placeholder with the database password. Percent-encode
special characters in the password when it is embedded in a URL. Do not put
the connection string in this repository, `.env.local`, a shared note, or a
committed script.

Load the connection string without echoing it to the terminal, then export it
for the commands in the current shell:

```bash
read -s GLOTTER_DB_URL
export GLOTTER_DB_URL
```

Paste the full connection string when prompted and press Enter. The value lasts
only for the current shell session. Run `unset GLOTTER_DB_URL` when finished.

If this machine is already linked with `supabase link`, that link is useful for
other CLI work, but the explicit `--db-url` below makes the backup source clear
and reproducible.

## Create a backup

Create a dated directory **outside the Git repository**, ideally on an encrypted
drive or in an encrypted off-site backup location, and change into it. Never
commit database dumps: the data file can contain user accounts, translation
content, and other sensitive production data.

Run all three commands from that directory:

```bash
supabase db dump --db-url "$GLOTTER_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$GLOTTER_DB_URL" -f schema.sql
supabase db dump --db-url "$GLOTTER_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

Do not mix files from different backup runs. Record the date, source project,
Supabase CLI version, and operator in a separate note beside the dumps. Keep at
least one copy on storage that is not this laptop.

## Check the backup

A command completing successfully is necessary but not enough. Check that each
file exists and is non-empty:

```bash
ls -lh roles.sql schema.sql data.sql
test -s roles.sql && test -s schema.sql && test -s data.sql
```

Inspect the beginning and end of each file for a normal PostgreSQL dump header
and completion marker. Do not paste production dump contents into chats or bug
reports.

The strongest check is a restore rehearsal into a new, disposable Supabase
project. Use a different connection string, verify representative row counts,
sign-in, project access, and translation editing, then delete the disposable
project only after the verification is recorded. Never rehearse against the
production connection string.

## Restore into a new project

Treat restore as a recovery operation, not a routine production command:

1. Create a new Supabase project.
2. Enable any non-default extensions and Database Webhooks used by the source project.
3. Obtain the new project's Session pooler or direct connection string.
4. Set a separate `GLOTTER_RESTORE_DB_URL` variable and verify it identifies the new project.
5. Run the restore from the directory containing one complete backup set.

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$GLOTTER_RESTORE_DB_URL"
```

Afterward, re-enable any required Realtime publications and reset passwords for
custom login roles. Follow the official restore guide if the source uses Vault,
column encryption, custom changes inside the managed `auth` or `storage`
schemas, or if the restore reports managed-role ownership errors.

Verify the restored application before treating the backup as recoverable:

- expected projects, users, languages, keys, translations, and history counts;
- platform-admin and project-owner access;
- a member's view-only and editable language boundaries;
- sign-in and one reversible translation edit;
- RLS and database advisor results.

Keep production unchanged until the rehearsal passes and the recovery decision
is explicit.
