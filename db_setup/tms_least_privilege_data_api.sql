-- Make the Data API grant layer explicit and opt future public-schema objects
-- out of automatic exposure. Designed for Supabase/Postgres.

BEGIN;

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
FROM anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.projects,
  public.project_languages,
  public.translation_keys,
  public.translations,
  public.project_members,
  public.project_invites
TO authenticated;

GRANT SELECT ON TABLE
  public.platform_admins,
  public.translation_history
TO authenticated;

GRANT SELECT, INSERT ON TABLE
  public.project_activity_log
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.projects,
  public.project_languages,
  public.translation_keys,
  public.translations,
  public.project_members,
  public.platform_admins,
  public.translation_history,
  public.project_invites,
  public.project_activity_log
TO service_role;

ALTER POLICY view_own_projects ON public.projects TO authenticated;
ALTER POLICY owners_update_projects ON public.projects TO authenticated;
ALTER POLICY owners_delete_projects ON public.projects TO authenticated;

ALTER POLICY view_project_languages ON public.project_languages TO authenticated;
ALTER POLICY owners_manage_languages ON public.project_languages TO authenticated;

ALTER POLICY view_translation_keys ON public.translation_keys TO authenticated;
ALTER POLICY owners_manage_keys ON public.translation_keys TO authenticated;

ALTER POLICY delete_translations ON public.translations TO authenticated;

ALTER POLICY view_project_members ON public.project_members TO authenticated;
ALTER POLICY owners_manage_members ON public.project_members TO authenticated;
ALTER POLICY owners_update_members ON public.project_members TO authenticated;
ALTER POLICY owners_delete_members ON public.project_members TO authenticated;

ALTER POLICY admins_view_admins ON public.platform_admins TO authenticated;
ALTER POLICY view_translation_history ON public.translation_history TO authenticated;

ALTER POLICY view_project_invites ON public.project_invites TO authenticated;
ALTER POLICY owners_manage_invites ON public.project_invites TO authenticated;

ALTER POLICY view_activity_log ON public.project_activity_log TO authenticated;
ALTER POLICY insert_activity_log ON public.project_activity_log TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

-- Rollback:
-- Restore the former broad default privileges for postgres, change the altered
-- policy targets back to PUBLIC, and restore the former per-table grants. Do
-- not restore TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN unless a concrete
-- trusted-database use case requires them. Supabase-managed supabase_admin
-- defaults cannot be changed by this project's postgres role.
