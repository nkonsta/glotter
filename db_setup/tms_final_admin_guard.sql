-- Atomic final-platform-admin safeguard for existing v12 installations.
-- Designed for Supabase/Postgres. Run in a single transaction.

BEGIN;

-- A transaction-level advisory lock serializes DELETE statements without
-- blocking ordinary reads of platform_admins.
CREATE OR REPLACE FUNCTION public.serialize_platform_admin_deletes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(194637201, 731945113);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_platform_admin_remains()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'At least one platform admin is required.',
      CONSTRAINT = 'platform_admins_must_not_be_empty';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_platform_admin_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'The platform admin table cannot be truncated.',
    CONSTRAINT = 'platform_admins_must_not_be_empty';
END;
$$;

DROP TRIGGER IF EXISTS serialize_platform_admin_deletes ON public.platform_admins;
CREATE TRIGGER serialize_platform_admin_deletes
  BEFORE DELETE ON public.platform_admins
  FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_platform_admin_deletes();

DROP TRIGGER IF EXISTS ensure_platform_admin_remains ON public.platform_admins;
CREATE TRIGGER ensure_platform_admin_remains
  AFTER DELETE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.ensure_platform_admin_remains();

DROP TRIGGER IF EXISTS prevent_platform_admin_truncate ON public.platform_admins;
CREATE TRIGGER prevent_platform_admin_truncate
  BEFORE TRUNCATE ON public.platform_admins
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_platform_admin_truncate();

REVOKE EXECUTE ON FUNCTION public.serialize_platform_admin_deletes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_platform_admin_remains() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_platform_admin_truncate() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS admins_manage_admins ON public.platform_admins;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.platform_admins FROM anon, authenticated;

COMMIT;

-- Rollback notes:
-- DROP TRIGGER ... and DROP FUNCTION ... for the three objects above, then
-- restore the former admins_manage_admins policy and client table grants only
-- if direct client-side platform-admin mutations are intentionally reinstated.
