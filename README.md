# Glotter — Translation Management

A self-hostable, multi-language translation manager. Import your locale files,
edit every language side by side, let AI draft what's missing, and control who
can see and edit which languages — all backed by Supabase.

- **Public landing page** at `/` (statically rendered).
- **The app** lives at `/dashboard`, behind authentication.

🔗 **Live:** <https://glotter.vercel.app/>

---

## Features

- **Side-by-side grid** — translation keys as rows, languages as columns, inline editing.
- **Per-language JSON import** and export (single file or per-language).
- **AI-assisted translation** — draft missing values across languages (optional, OpenAI-compatible).
- **Role-based access control** — platform admins, per-project owners, and members with per-language view/edit permissions.
- **Audit trail** — translation changes are logged with author and timestamp.
- **Missing-translation indicators**, search, and All/Missing/Complete filters.

---

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + Auth) ·
TanStack Table · Tailwind CSS v4 · Radix UI.

**Requirements:** Node.js 20+ and a Supabase project (free tier is fine).

---

## Self-hosting setup

### 1. Create a Supabase project

Create one at [supabase.com](https://supabase.com). You'll need three values
from **Project Settings → API**:

- **Project URL**
- **anon public** key
- **service_role** key (secret — server-side only)

### 2. Create the database schema

In the Supabase dashboard, open **SQL Editor**, paste the contents of
[`db_setup/schema/tms_full_schema_v12.sql`](./db_setup/schema/tms_full_schema_v12.sql), and
run it. This creates all tables, RLS policies, and helper functions.

If AI translation will be enabled, also run
[`db_setup/optional/tms_ai_usage_controls.sql`](./db_setup/optional/tms_ai_usage_controls.sql).
It adds the server-only shared concurrency and hourly usage controls.

> Ignore `db_setup/upgrades/tms_acl_v12.sql` — it's a migration for upgrading an older
> v11 database, not for fresh installs. See [`db_setup/README.md`](./db_setup/README.md).

### 3. Configure environment variables

```bash
cp env.example .env.local
```

Edit `.env.local`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon public key (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key. Server-only — used for saving translations and admin actions. **Never expose to the client.** |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Public origin (e.g. `http://localhost:3000`). Used for social-preview (Open Graph) image URLs. |
| `OPENAI_API_KEY` | Optional | Enables AI translation. Without it, the rest of the app works; AI fill is disabled. |
| `OPENAI_MODEL`, `OPENAI_BASE_URL`, `AI_*`, `NEXT_PUBLIC_AI_*` | Optional | Tune the AI provider, limits, and batching. Set `AI_USAGE_LIMITS_ENABLED=true` in production after applying the AI usage SQL patch. See `env.example`. |

> The service role key bypasses Row-Level Security. It is only read server-side
> (in `app/api/**`) and is never sent to the browser. Keep it secret.

### 4. Configure Supabase Auth

In **Authentication → URL Configuration → Redirect URLs**, add the app entry
point so sign-up confirmation and password-reset links land in the app:

- `http://localhost:3000/dashboard`
- `https://your-domain.com/dashboard` (once deployed)

This instance is **admin-provisioned**: signing up creates an account, but a new
user has no access until a platform admin grants it. For a closed instance you
can disable public sign-ups in Supabase and create users from the in-app
**Manage users** screen instead.

### 5. Create the first platform admin

This is the one manual step, and the app is unusable without it — there's no UI
to create the *first* admin.

1. Create a user account. Easiest: **Authentication → Users → Add user** in the
   Supabase dashboard (enable "Auto Confirm User"). Or sign up through the app at
   `/dashboard` and confirm the email.
2. Copy that user's **User UID** from the Users list.
3. In the **SQL Editor**, run:

   ```sql
   insert into platform_admins (user_id) values ('PASTE-USER-UID-HERE');
   ```

That user is now a platform admin: they can create projects, manage users, and
assign per-project owners and members from the app.

### 6. Install and run

```bash
npm install
npm run dev
```

Open <http://localhost:3000> for the landing page, or
<http://localhost:3000/dashboard> to sign in.

---

## Access model

| Role | Scope | Can do |
| --- | --- | --- |
| **Platform admin** | Whole instance | Everything: all projects, manage users, assign owners/members, edit any language. Bootstrapped via SQL (step 5). |
| **Project owner** | One project | Full access to that project — all languages, keys, languages, and members. |
| **Member** | One project | View/edit only the specific languages granted to them (per-language permissions). |

Owners and members are assigned by a platform admin (or project owner) through
the **Manage users** / project-members screens. Permissions are enforced at the
database level by Row-Level Security, not just in the UI.

---

## Usage

### Projects & languages
- **Create a project** from the header dropdown ("New project…"). Optionally
  provide initial languages as comma-separated codes (`en, fr, de`) or
  `code:name` pairs (`en:English`). Codes are lowercased.
- **Manage languages** ("Manage languages…") to add/rename/remove languages.
  Removing a language deletes its translations. You can't remove the last one.
- **Delete a project** ("Delete project…", type the name to confirm). Cascades
  to its languages, keys, and translations.

### Editing translations
1. Select a project. Keys and their values per language load into the grid.
2. Click a cell, type, **Enter** to save or **Escape** to cancel (optimistic UI).
3. Missing translations are highlighted; use the All/Missing/Complete filter and
   search to navigate.

### Import / export
- **Import** per-language JSON to populate values.
- **Export** one selected language as a JSON file, or multiple languages as a ZIP
  containing one JSON file per language.
- Choose **Nested JSON** (the default) for existing Ionic catalogs, or **Flat JSON**
  for React catalogs that use complete dotted keys. The format applies to both
  individual files and ZIP entries.
- Nested JSON cannot represent a string key and its child keys together (for
  example, `settings.sosButton` and `settings.sosButton.back`). Export stops and
  identifies the collision; choose Flat JSON to keep every key without renaming it.
- An optional fallback fills missing (`null` or absent) translations. Empty
  strings remain empty; with no fallback, missing values are omitted.

### AI fill (optional)
With an OpenAI key configured, use **AI fill missing…** to draft missing
translations across languages, then review inline before saving. Source strings
and glossary terms selected for translation are sent to the configured AI
provider. Glotter's production logs record request metadata and usage, not
source text, glossary contents, or generated translations.

### Development checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Import/export regression tests run with `npm test`. To additionally validate
private local English and French QR Patrol catalogs (1,774 keys each), without
copying their contents into the repository:

```bash
GLOTTER_CATALOG_DIR=/path/to/catalogs npm test -- lib/importExport.test.ts
```

Manual export checks: select Nested JSON and export an ordinary Ionic catalog;
select a catalog containing both a parent string and child keys and confirm
nested export reports the collision and keeps the dialog open. Switch to Flat
JSON and export one language, then multiple languages; confirm dotted keys and
values match in the downloaded JSON and ZIP. Repeat with and without fallback.

`npm run test:ai-smoke` is an explicit, billable provider smoke test. It loads
the server-side OpenAI configuration and never runs as part of `npm test`.

### Version bumps for pull requests

Every PR targeting `main`, including documentation and dependency updates,
must increase the application version. Before merging, run:

```bash
npm version patch --no-git-tag-version
```

Use `minor` for new features or `major` for breaking changes. Commit both
`package.json` and `package-lock.json`. The dashboard displays this version.
CI's `Version check` compares the proposed merge result with the PR's base
commit using semantic version ordering and checks both root lockfile versions.
Changing only build metadata does not count as a version increase.
Versions must not contain whitespace padding or a `v` prefix.

To run the same check locally after fetching `origin/main`:

```bash
npm run check:version
npm test -- scripts/check-version.test.mjs
```

GitHub branch protection for `main` must require pull requests (zero approvals
is sufficient), require both `verify` and `Version check`, require branches to
be up to date before merging, and apply the restrictions to administrators.
If another PR merges first, update your
branch from `main` and increase the version again if necessary; two PRs cannot
merge with the same version. The workflow alone does not block merges unless
the check is required in GitHub's settings.

After each merge, the separate `Release tag` workflow creates and pushes an
annotated tag on the exact merged commit, using the version as the tag name
(for example `1.5.1`, matching existing tags without a `v` prefix). It is not
cancelled by later merges. A rerun skips a tag already on the correct commit
and fails if that name points elsewhere; release tags are never overwritten.
This creates a Git tag; it does not publish a GitHub Release or npm package.

Tag automation regression tests run with
`npm test -- scripts/tag-release.test.mjs`. If recovering a failed tagging
run, `npm run tag:release -- <merged-commit>` creates and pushes a real tag;
verify the commit is the intended release on `main` before running it.

---

## Deploy on Vercel

1. Import the repo into Vercel.
2. Add the same environment variables from step 3 (set `NEXT_PUBLIC_SITE_URL` to
   your production URL).
3. Add `https://your-domain.com/dashboard` to the Supabase Auth redirect URLs
   (step 4).

The landing page (`/`) is statically rendered; the app (`/dashboard`) runs
client-side against Supabase.

---

## Security & production hardening

The schema is secure by default — Row-Level Security is enabled on every table,
and the access-control helper functions run with a pinned `search_path`. A few
things still live in the Supabase dashboard that are worth setting before you
expose an instance publicly:

- **Enable leaked-password protection** (Authentication → Policies) so compromised
  passwords are rejected via [HaveIBeenPwned](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- **Consider enabling MFA** options (Authentication → Providers) for account security.
- **Restrict sign-ups** if you want a closed instance — disable public sign-ups
  and provision users from the in-app **Manage users** screen.
- **Keep `SUPABASE_SERVICE_ROLE_KEY` secret** — it's server-only and bypasses RLS.
- Your Supabase **URL and anon key are public by design** (they ship in the client
  bundle); RLS is what protects your data, so don't disable it.

Run Supabase's database linter (or `get_advisors`) periodically to catch new issues.

Free Supabase projects do not include downloadable automatic backups. Follow
the [manual backup and restore guide](./docs/operations/manual-supabase-backups.md)
to create off-site role, schema, and data dumps with the Supabase CLI.

---

## Troubleshooting

- **Can't see anything after signing in** — you're not a platform admin yet and
  haven't been added to a project. Complete step 5.
- **Saving translations fails** — confirm `SUPABASE_SERVICE_ROLE_KEY` is set.
- **Sign-up / reset links go to the wrong place** — add `/dashboard` to the
  Supabase redirect URLs (step 4).
- **Empty project list as a non-admin** — expected; an admin must grant project
  membership.
- Check the browser console and Supabase logs for details.

---

## Project structure

```
glotter/
├── app/
│   ├── page.tsx                 # Public landing page (/)
│   ├── layout.tsx               # Root layout (theme, fonts)
│   ├── opengraph-image.tsx      # Generated social-preview image
│   ├── dashboard/               # Authenticated app (/dashboard)
│   │   ├── layout.tsx           # Auth + toast providers
│   │   └── page.tsx             # Main translation app
│   └── api/                     # Server routes (use the service role)
│       ├── translations/        # save, bulk-save
│       ├── admin/               # users, project-members
│       └── ai-translate/        # AI drafting
├── components/                  # Grid, auth, UI primitives
├── lib/                         # Supabase clients, queries, theme, AI
├── docs/                        # Product, design, plans, operations, and archive
├── db_setup/                    # Schema, upgrades, patches, optional SQL, and audits
└── env.example                  # Environment variable template
```

See the [documentation index](./docs/README.md) and
[database setup guide](./db_setup/README.md) for the detailed layout.
