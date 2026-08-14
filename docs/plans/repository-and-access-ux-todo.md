# Repository Organization and Access UX — Implementation Todo

This checklist tracks the approved work to organize project documentation and
database scripts, clarify the account-to-project access workflow, and verify the
result. Items are checked only after the corresponding work has been completed
and reviewed.

## 1. Repository organization

- [x] Create a documented top-level structure for product, design, active-plan,
      and archived documentation.
- [x] Move the translation-management PRD into `docs/product/`.
- [x] Move UI specifications and refinement notes into `docs/design/`.
- [x] Move the active production-readiness plan into `docs/plans/`.
- [x] Move the completed user-management plan into `docs/archive/`.
- [x] Add `docs/README.md` as the documentation index and source-of-truth guide.
- [x] Keep repository/tool instruction files and component-local guidance beside
      the code they govern.

## 2. Database file organization

- [x] Move the clean-install database baseline into `db_setup/schema/`.
- [x] Move the historical v11-to-v12 upgrade into `db_setup/upgrades/`.
- [x] Move existing-install SQL changes into `db_setup/patches/`.
- [x] Move optional AI usage controls into `db_setup/optional/`.
- [x] Move access and RLS audit documents into `db_setup/audits/`.
- [x] Rewrite `db_setup/README.md` as a clear entry point with fresh-install,
      upgrade, existing-install, and optional-feature paths.
- [x] Preserve descriptive filenames and the existing installation order.

## 3. Reference repair

- [x] Update root `README.md` links, setup instructions, and project tree.
- [x] Update `AGENTS.md`, `env.example`, and cross-document references.
- [x] Search the repository for stale old paths or filenames and repair them.
- [x] Confirm Markdown links point to existing local files.

## 4. Access-management UX

- [x] Rename the global entry point from “Access directory” to “Users & access.”
- [x] Rename the project action from “Manage members” to “Project access.”
- [x] Add an at-a-glance workflow explaining: create account, grant project
      access, and choose editable languages.
- [x] Clarify the difference between platform-admin access and project access.
- [x] Add concise, accessible help for owner/member roles and view/edit language
      permissions.
- [x] Make account creation lead directly into project-access assignment when a
      project is available.
- [x] Rename ambiguous actions so removing project access is distinct from
      permanently deleting a user account.
- [x] Improve success, warning, and confirmation copy around access changes.
- [x] Preserve existing authorization behavior and API contracts.

## 5. Manual backup guidance

- [x] Add a manual Supabase logical-backup guide using the currently supported
      CLI dump commands for roles, schema, and data.
- [x] Document prerequisites, connection-string handling, safe backup storage,
      restore commands, and Supabase Storage limitations.
- [x] Keep automation explicitly out of scope pending further discussion.

## 6. Verification and review

- [x] Review the full diff for unintended file or behavior changes.
- [x] Run `git diff --check`.
- [x] Run `npm run lint`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
  - The configured Turbopack build reached compilation but the host blocked its
    CSS worker from binding an internal port. The unrestricted retry produced
    the same host-level error.
  - `npx next build --webpack` completed successfully as the production compile
    fallback, including TypeScript, page generation, and route collection.
- [x] Start the application locally and confirm the public and dashboard routes
      respond successfully.
- [x] Inspect the access-management UI in the local runtime where authentication
      state permits it.
- [x] Record any validation that still requires the project owner’s real account
      or Supabase dashboard access.

## Validation notes

- The authenticated `Users & access`, project-assignment, `Project access`, and
  edit-access screens were inspected read-only against the configured Supabase
  project. No account, membership, permission, or translation data was changed.
- A one-time invalid-refresh-token message appeared after localhost was switched
  from placeholder Supabase values to the configured project. It did not recur
  on reload or during the authenticated checks; the active session remained
  healthy, so no application change was required.
- The account-creation-to-assignment transition was verified by code review and
  TypeScript/lint validation, but no disposable production account was created
  solely for this check.
- The manual dump commands were verified against current Supabase documentation,
  but no production dump was executed because the Supabase CLI is not available
  on this shell's `PATH`.

## Post-validation UI feedback

- [x] Make the access-workflow guide collapsible and collapsed by default.
- [x] Add consistent vertical spacing between the guide, account search, and
      accounts section.
- [x] Verify the refined layout in the authenticated local runtime.
- [x] Re-run targeted lint and TypeScript validation.
