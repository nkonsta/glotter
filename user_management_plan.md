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

### Slice 3: global access directory and ownerless recovery

- The platform-admin access directory shows every account's admin status and
  project assignments, plus each project's owners and members.
- Ownerless projects are clearly identified and include a direct recovery path
  for assigning an existing non-admin account as owner.
- Existing non-admin accounts can be assigned as project owners or members with
  the same role and language-permission rules as project member management.
- Granting platform-admin access never creates project memberships. Existing
  memberships are preserved and shown as dormant while global access is active.
- Revoking platform-admin access explicitly restores dormant memberships by
  default or removes all project memberships. Demotion and optional cleanup are
  atomic.
- An admin cannot demote their own account. Another admin must perform the
  operation, and the database safeguard still prevents removing the final
  platform admin.

### Validation completed

- Verified an existing-account match against the connected Supabase project.
- Verified the unknown-account response.
- Verified that a platform admin cannot be selected for project membership.
- Verified that an ownerless project remains accessible to a platform admin.
- Verified owner removal and the ownerless warning in the live UI.
- Verified password-length enforcement in the live UI.
- Verified the database rejects final-admin deletion and truncation, and direct
  client mutations of `platform_admins` are not permitted.
- Verified the full access-directory workflow in the live UI with a disposable
  account: owner assignment, dormant membership on admin grant, restoration on
  revoke, atomic remove-all on revoke, member language permissions, ownerless
  recovery, and account deletion.
- Verified the admin-operation migration in the connected Supabase project with
  rollback-safe database tests. Membership preservation, cleanup, final-admin
  rejection, and rollback all passed without leaving test data.
- Verified unauthenticated access-directory GET and PATCH requests return 401.
- Verified the new admin operation is callable only by the service role and is
  not exposed to anonymous or authenticated database roles.
- `npm run lint`, `npm run build`, and `git diff --check` pass.

The final-admin safeguard is a focused database and RLS change. No unrelated
schema or policy changes were made in these slices.

## Planned

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
