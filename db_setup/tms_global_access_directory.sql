-- Platform-admin access operation for the global access directory.
-- Designed for Supabase/Postgres. Run in a single transaction.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_platform_admin_access(
  p_user_id UUID,
  p_enabled BOOLEAN,
  p_remove_memberships BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  IF p_enabled THEN
    INSERT INTO public.platform_admins (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN affected_rows > 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = p_user_id
  ) THEN
    RETURN false;
  END IF;

  IF p_remove_memberships THEN
    DELETE FROM public.project_members WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.platform_admins WHERE user_id = p_user_id;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_platform_admin_access(UUID, BOOLEAN, BOOLEAN)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_platform_admin_access(UUID, BOOLEAN, BOOLEAN)
TO service_role;

COMMIT;

-- Rollback:
-- DROP FUNCTION public.set_platform_admin_access(UUID, BOOLEAN, BOOLEAN);
