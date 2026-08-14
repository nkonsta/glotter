-- Require authentication for application-table access and restrict project
-- creation to platform admins. Designed for Supabase/Postgres.

BEGIN;

-- Project creation is a platform-admin operation. The previous policy used
-- WITH CHECK (true), which did not encode the admin-only UI rule.
DROP POLICY IF EXISTS owners_insert_projects ON public.projects;
CREATE POLICY owners_insert_projects ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

-- Glotter has no anonymous application-data flow. Remove the grant layer for
-- unauthenticated Data API requests while leaving authenticated access under
-- the existing RLS policies.
REVOKE ALL PRIVILEGES ON TABLE
  public.projects,
  public.project_languages,
  public.translation_keys,
  public.translations,
  public.project_members,
  public.platform_admins,
  public.translation_history,
  public.project_invites,
  public.project_activity_log
FROM anon;

COMMIT;

-- Rollback:
-- Recreate owners_insert_projects with FOR INSERT WITH CHECK (true), then
-- restore only the anonymous table privileges that are intentionally needed.
-- The pre-migration deployment granted all table privileges to anon except on
-- platform_admins, where anon had SELECT only.
