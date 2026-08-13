-- Keep authorization helpers available to signed-in users and trusted server
-- code while removing anonymous/direct PUBLIC execution.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin()
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_member(UUID)
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_owner(UUID)
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_language(UUID, TEXT)
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_language(UUID, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_platform_admin()
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_project_member(UUID)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_project_owner(UUID)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_language(UUID, TEXT)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_language(UUID, TEXT)
TO authenticated, service_role;

COMMIT;

-- Rollback:
-- GRANT EXECUTE on these five functions to PUBLIC and anon. The explicit
-- authenticated and service_role grants may remain.
