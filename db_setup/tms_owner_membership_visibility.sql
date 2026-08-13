-- Let project owners read the membership rows they are authorized to manage.
-- UPDATE requires a matching SELECT policy in PostgreSQL RLS.

BEGIN;

DROP POLICY IF EXISTS view_project_members ON public.project_members;
CREATE POLICY view_project_members ON public.project_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_project_owner(project_id)
  );

COMMIT;

-- Rollback:
-- Recreate view_project_members with
-- USING (user_id = auth.uid() OR public.is_platform_admin()).
