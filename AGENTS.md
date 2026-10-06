# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router pages, layouts, and global styles (`app/globals.css`).
- `components/`: Feature components and UI primitives (`components/ui/`), plus auth/admin UIs.
- `lib/`: Supabase client, data access, and shared utilities (e.g., `lib/translations.ts`).
- `public/`: Static assets served by Next.js.
- `docs/`: Product, design, active planning, operations, and archived project documentation. See `docs/README.md`.
- `db_setup/`: Supabase schema, upgrades, ordered patches, optional features, and audits. See `db_setup/README.md`.

## Build, Test, and Development Commands
- `npm install`: Install dependencies.
- `npm run dev`: Start the dev server with Turbopack at `http://localhost:3000`.
- `npm run build`: Production build (Turbopack).
- `npm run start`: Run the production server.
- `npm run lint`: Run ESLint (Next.js core-web-vitals + TypeScript).

Environment setup:
- `cp env.example .env.local` and fill in Supabase values before running locally.

## Coding Style & Naming Conventions
- Language: TypeScript with React/Next.js (App Router).
- Indentation: 2 spaces; use single quotes and semicolons as seen in `app/page.tsx`.
- Naming: Components in `PascalCase` (e.g., `TranslationGrid.tsx`), hooks start with `use`.
- Imports: Prefer the `@/` path alias (from `tsconfig.json`).
- Styling: Tailwind utility classes with shared helpers like `lib/cn`.

## Testing Guidelines
- No automated test suite is configured yet.
- Use `npm run lint` and follow the manual checklist in `README.md` for UI behavior.
- If you add tests, keep them near the feature they cover and document how to run them.

## Commit & Pull Request Guidelines
- Commit messages follow simple conventional prefixes (e.g., `chore:`, `security:`) with a short summary.
- PRs should include:
  - A clear description of the change.
  - Linked issue or context (if applicable).
  - Screenshots or screen recordings for UI updates.
  - Notes about any DB/schema changes or new environment variables.

## Application Versioning
- Every PR targeting `main`, including documentation and dependency updates,
  must increase the application version above the current version on `main`.
- Run `npm version patch --no-git-tag-version` for fixes and maintenance;
  use `minor` for new features or `major` for breaking changes. Commit both
  `package.json` and `package-lock.json`. Do not create a release tag on the
  PR branch when bumping the version.
- Fetch `origin/main`, then run `npm run check:version` before submitting or
  merging a PR. Run `npm test -- scripts/check-version.test.mjs` when changing
  version enforcement.
- CI's `Version check` requires a higher semantic version and matching root
  versions in the lockfile. Build-metadata-only changes do not count.
- `main` requires PRs, passing `verify` and `Version check` checks, and branches
  to be up to date. These protections also apply to administrators. If another
  PR merges first, update from `main` and bump again if the version is no longer
  higher. Never bypass the checks to merge a duplicate version.
- The dashboard reads its displayed version from `package.json`; see the
  README's "Version bumps for pull requests" section for contributor steps.
- After each merge to `main`, the `Release tag` workflow automatically creates
  and pushes an annotated tag matching `package.json` (e.g. `1.5.1`, without a
  `v` prefix) on that exact merged commit. It runs independently of CI so a
  later merge cannot cancel tagging of an earlier version.
- Do not manually tag PR commits, move existing release tags, or force-push
  tags. A rerun skips a tag already on the correct commit and fails if the tag
  points elsewhere. Diagnose a failed `Release tag` run before retrying it.
- Run `npm test -- scripts/tag-release.test.mjs` when changing tag automation.
  `npm run tag:release -- <commit>` creates and pushes a real tag; only use it
  for an authorized release commit on `main` when recovering a failed run.

## Configuration & Security Tips
- Store secrets only in `.env.local`; never commit credentials.
- Supabase schema expectations live in `db_setup/README.md` and the root `README.md`—keep both updated if tables change.

## Architecture Overview
- UI renders in the Next.js App Router (`app/`) and composes feature components from `components/`.
- Data access flows through `lib/` utilities into Supabase (`lib/supabase.ts`, `lib/translations.ts`).
- Project, language, key, and translation entities map to the Supabase tables described in `README.md`.
