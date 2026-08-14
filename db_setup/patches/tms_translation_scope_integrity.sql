-- Keep translation keys and language rows within the same project at the RLS
-- boundary. Designed for Supabase/Postgres.

BEGIN;

DROP POLICY IF EXISTS view_translations ON public.translations;
CREATE POLICY view_translations ON public.translations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.translation_keys tk
      JOIN public.project_languages pl
        ON pl.id = translations.project_language_id
       AND pl.project_id = tk.project_id
      WHERE tk.id = translations.key_id
        AND public.can_view_language(tk.project_id, pl.language_code)
    )
  );

DROP POLICY IF EXISTS edit_translations ON public.translations;
CREATE POLICY edit_translations ON public.translations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.translation_keys tk
      JOIN public.project_languages pl
        ON pl.id = translations.project_language_id
       AND pl.project_id = tk.project_id
      WHERE tk.id = translations.key_id
        AND public.can_edit_language(tk.project_id, pl.language_code)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.translation_keys tk
      JOIN public.project_languages pl
        ON pl.id = translations.project_language_id
       AND pl.project_id = tk.project_id
      WHERE tk.id = translations.key_id
        AND public.can_edit_language(tk.project_id, pl.language_code)
    )
  );

DROP POLICY IF EXISTS insert_translations ON public.translations;
CREATE POLICY insert_translations ON public.translations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.translation_keys tk
      JOIN public.project_languages pl
        ON pl.id = translations.project_language_id
       AND pl.project_id = tk.project_id
      WHERE tk.id = translations.key_id
        AND public.can_edit_language(tk.project_id, pl.language_code)
    )
  );

COMMIT;

-- Rollback:
-- Recreate the three policies without the pl.project_id = tk.project_id join
-- condition. The explicit UPDATE WITH CHECK may remain because it matches the
-- former effective behavior for valid same-project rows.
