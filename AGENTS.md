# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router pages, layouts, and global styles (`app/globals.css`).
- `components/`: Feature components and UI primitives (`components/ui/`), plus auth/admin UIs.
- `lib/`: Supabase client, data access, and shared utilities (e.g., `lib/translations.ts`).
- `public/`: Static assets served by Next.js.
- `db_setup/`: Database setup resources (keep Supabase schema changes here if added).

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

## Configuration & Security Tips
- Store secrets only in `.env.local`; never commit credentials.
- Supabase schema expectations live in `README.md`—keep it updated if tables change.

## Architecture Overview
- UI renders in the Next.js App Router (`app/`) and composes feature components from `components/`.
- Data access flows through `lib/` utilities into Supabase (`lib/supabase.ts`, `lib/translations.ts`).
- Project, language, key, and translation entities map to the Supabase tables described in `README.md`.
