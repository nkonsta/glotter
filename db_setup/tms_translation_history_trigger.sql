-- Allow authorized direct translation updates to write their audit row without
-- granting clients permission to forge translation history.

BEGIN;

CREATE OR REPLACE FUNCTION public.log_translation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.value IS DISTINCT FROM NEW.value) THEN
    INSERT INTO public.translation_history
      (translation_id, old_value, new_value, updated_by)
    VALUES
      (NEW.id, OLD.value, NEW.value, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_translation_change()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_translation_change()
TO service_role;

COMMIT;

-- Rollback:
-- Recreate log_translation_change() without SECURITY DEFINER and restore any
-- direct EXECUTE grants that are intentionally required.
