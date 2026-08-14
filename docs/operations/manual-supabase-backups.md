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

Logical dumps also do not preserve Supabase project configuration such as API
keys, Auth site and redirect URLs, SMTP or OAuth provider settings, custom
domains, or dashboard-managed Webhooks. Record those settings separately. A
manual logical restore into a different project also cannot decrypt Vault or
column-encrypted values unless the source project's encryption root key is
copied while the source project is still accessible.

## Prerequisites

Install and start:

- the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started);
- [Docker Desktop](https://docs.docker.com/desktop/), which the CLI uses to run `pg_dump`;
- PostgreSQL's `psql` client before performing a restore.

On macOS, install the `psql` client with Homebrew and add it to the current
shell's path:

```bash
brew install libpq
export PATH="$(brew --prefix libpq)/bin:$PATH"
psql --version
```

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

The repository backup script prompts for this connection string without
echoing it. To run the commands manually instead, load it into the current
shell:

```bash
read -s GLOTTER_DB_URL
export GLOTTER_DB_URL
```

Paste the full connection string when prompted and press Enter. The value lasts
only for the current shell session. Run `unset GLOTTER_DB_URL` when finished.

If this machine is already linked with `supabase link`, that link is useful for
other CLI work, but the explicit `--db-url` below makes the backup source clear
and reproducible.

## Run the repository backup script

The checked-in
[`scripts/backup-supabase.zsh`](../../scripts/backup-supabase.zsh) script runs
the three official dump commands, checks that the files are non-empty, verifies
that every `COPY` data section has a terminator, and writes and checks SHA-256
checksums. It disables Supabase CLI telemetry for the run and never writes the
connection string to disk.

From the repository root, with Docker Desktop running:

```bash
./scripts/backup-supabase.zsh
```

Paste the Session pooler connection string when prompted. A successful run
creates a private dated directory such as:

```text
~/Backups/glotter/2026-08-14_11-51-33/
├── roles.sql
├── schema.sql
├── data.sql
└── SHA256SUMS
```

The directory and files are readable only by the current user. If the script
exits before reporting success, treat that run as incomplete even if some files
exist. Keep the completed backup set together and copy it to encrypted off-site
storage.

## Create a backup manually

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
shasum -a 256 roles.sql schema.sql data.sql > SHA256SUMS
shasum -a 256 -c SHA256SUMS
```

Do not assume every file will contain PostgreSQL's standard header and
completion comments: the Supabase CLI may filter them from role and schema
dumps. A role dump can also be very small when the project has no custom roles.
Do not paste production dump contents into chats or bug reports.

The strongest check is a restore rehearsal into a new, disposable Supabase
project. Use a different connection string, verify representative row counts,
sign-in, project access, and translation editing, then delete the disposable
project only after the verification is recorded. Never rehearse against the
production connection string.

## Restore into a new project

Treat restore as a recovery operation, not a routine production command:

1. Create a new Supabase project.
2. Do not apply Glotter's baseline schema; `schema.sql` supplies the recovered
   schema.
3. Enable any non-default extensions and Database Webhooks used by the source
   project.
4. Obtain the new project's reference and Session pooler or direct connection
   string.
5. Run the restore from the directory containing one complete backup set.

First verify the checksum file, then load the new connection string without
echoing it. The project-reference check guards against accidentally targeting
another project:

```bash
shasum -a 256 -c SHA256SUMS

read -r GLOTTER_RESTORE_PROJECT_REF
read -r -s GLOTTER_RESTORE_DB_URL
printf '\n'

if [[ -z "$GLOTTER_RESTORE_PROJECT_REF" ||
      -z "$GLOTTER_RESTORE_DB_URL" ||
      "$GLOTTER_RESTORE_DB_URL" != *"$GLOTTER_RESTORE_PROJECT_REF"* ]]; then
  echo 'Restore connection does not match the expected new project.'
  unset GLOTTER_RESTORE_DB_URL
  exit 1
fi

export GLOTTER_RESTORE_DB_URL
```

Confirm the connection and check that the new project's `public` schema is
empty. Stop and inspect the target if the count is not zero:

```bash
psql \
  --no-psqlrc \
  --tuples-only \
  --command 'SELECT current_database(), current_user' \
  --dbname "$GLOTTER_RESTORE_DB_URL"

psql \
  --no-psqlrc \
  --tuples-only \
  --command "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" \
  --dbname "$GLOTTER_RESTORE_DB_URL"
```

Restore all three files in one transaction. `ON_ERROR_STOP` and
`--single-transaction` prevent a failed restore from being accepted as a
partially restored database:

```bash
psql \
  --no-psqlrc \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$GLOTTER_RESTORE_DB_URL"
```

Clear the connection string after the command finishes:

```bash
unset GLOTTER_RESTORE_DB_URL
```

Afterward, re-enable any required Realtime publications, verify the Data API's
exposed-schema settings, and reset passwords for custom login roles. Follow the
official restore guide if the source uses Vault, column encryption, custom
changes inside the managed `auth` or `storage` schemas, or if the restore
reports managed-role ownership errors.

Auth users and password hashes are included in the logical data dump, but a
new project normally has a different JWT secret. Existing sessions therefore
become invalid and users must sign in again. See Supabase's
[Auth-user migration guidance](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects).

Verify the restored application before treating the backup as recoverable:

- expected projects, users, languages, keys, translations, and history counts;
- platform-admin and project-owner access;
- a member's view-only and editable language boundaries;
- sign-in and one reversible translation edit;
- RLS and database advisor results.

Before directing users to the recovered project, recreate the dashboard-only
configuration noted above and update the deployment's
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` with values from the new project. Redeploy Glotter
and complete the validation checklist against that deployment.

Keep production unchanged until the rehearsal passes and the recovery decision
is explicit.
