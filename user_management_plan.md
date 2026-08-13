# User Management and Access Plan

This document tracks the agreed access model, the work already delivered, and
the remaining incremental changes. Each slice should be independently usable
and verified before the next one begins.

## Access-model invariants

- A platform admin has global access to every project without a
  `project_members` row.
- The system must always retain at least one platform admin.
- A project may remain ownerless because platform admins can still manage it.
- A non-admin can be an owner of one project, a member of another, and have no
  access to another.
- Project membership can only be assigned to an existing Supabase Auth account.
- RLS changes are isolated, evidence-driven changes rather than a side effect of
  UI or API work.

## Built

### Slice 1: account and ownership safeguards

- Supabase Auth email lookup now scans every paginated user page instead of only
  the first page.
- Admin-created passwords and password changes require at least 12 characters.
- The final platform admin cannot be deleted. This is enforced atomically in the
  database, including concurrent and bulk deletion attempts; another admin must
  be granted first.
- Deleting a user is allowed even when that user is a project's only owner; the
  project becomes ownerless and remains manageable by platform admins.
- Removing or demoting a project's only owner shows a clear ownerless-project
  warning instead of blocking the action.

### Slice 2: assign existing accounts to projects

- Project member management performs an exact-email account lookup on the
  server and returns only the matching account's minimal identity information.
- Unknown accounts are not created or invited from project member management;
  the UI directs the operator to platform User Management.
- Existing project members are directed to the existing access editor.
- Platform admins are rejected as membership candidates because they already
  have global access.
- Membership creation and updates submit a selected user ID, which is
  revalidated against Supabase Auth on the server.
- Project membership still supports independent owner/member roles and
  per-language view/edit permissions.
- Invitation wording was removed from this flow.

### Validation completed

- Verified an existing-account match against the connected Supabase project.
- Verified the unknown-account response.
- Verified that a platform admin cannot be selected for project membership.
- Verified that an ownerless project remains accessible to a platform admin.
- Verified owner removal and the ownerless warning in the live UI.
- Verified password-length enforcement in the live UI.
- Verified the database rejects final-admin deletion and truncation, and direct
  client mutations of `platform_admins` are not permitted.
- `npm run lint`, `npm run build`, and `git diff --check` pass.

The final-admin safeguard is a focused database and RLS change. No unrelated
schema or policy changes were made in these slices.

## Planned

### Slice 3: global access directory and ownerless recovery

Build a platform-admin view that makes the current access model visible and
manageable across the whole instance:

- Show every account's platform-admin status and project assignments.
- Show each project's owners and members, with ownerless projects clearly
  identified.
- Allow a platform admin to assign an existing non-admin account as owner or
  member using the same membership rules as the project dialog.
- Allow platform-admin access to be granted or revoked without ever reducing
  the system to zero admins.
- Provide a direct recovery path for an ownerless project by assigning an
  existing account as its owner.
- Never create project memberships automatically when granting platform-admin
  access.
- Preserve any existing project memberships when granting platform-admin
  access and show them as dormant while global access is active.
- When revoking platform-admin access, show the dormant assignments and require
  an explicit choice between restoring them (the default) or removing all
  project memberships. Apply the demotion and any cleanup atomically.

This slice should reuse the existing server authorization checks and membership
operations where practical. It should not require an RLS change merely to build
the administrative view.

### Slice 4: RLS and database exposure audit

Treat database security as a separate review with its own validation:

- Document the expected access matrix for anonymous users, authenticated users,
  project members, project owners, platform admins, and the server service role.
- Compare deployed policies and helper functions with the checked-in schema.
- Exercise representative read/write cases for each role before proposing a
  policy change.
- Review Supabase advisor findings around GraphQL table exposure and executable
  `SECURITY DEFINER` helper functions.
- Review leaked-password protection as a separate Supabase Auth configuration
  decision.
- Make each proven correction as a focused migration with rollback notes and
  post-change verification.

## Deliberately deferred

- Project invitation emails and pending-invitation acceptance flows.
- Automatically adding platform admins to projects.
- Requiring every project to have an owner.
- Granting a user access to projects other than those explicitly selected.
