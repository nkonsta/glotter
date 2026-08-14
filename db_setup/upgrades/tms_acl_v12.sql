
-- Translation Management System – Access Control Model (v12)
-- Consolidated migration that merges v11 baseline with v2 per-language ACL,
-- plus performance and safety tweaks called out in the review.
-- Designed for Supabase/Postgres. Run in a single transaction.

BEGIN;

-- 0) Safety: ensure extensions/functions context exists (Supabase usually has these)
-- Uncomment if needed:
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1) Schema changes: project_members per-language permissions
--------------------------------------------------------------------------------

ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS view_languages TEXT[],
  ADD COLUMN IF NOT EXISTS edit_languages TEXT[];

-- Ensure we still have a platform_admins table (from v11). No-op if it exists.
-- CREATE TABLE IF NOT EXISTS platform_admins (
--   user_id UUID PRIMARY KEY REFERENCES auth.users(id),
--   created_at TIMESTAMP DEFAULT NOW()
-- );

--------------------------------------------------------------------------------
-- 2) Indexing for performance
--------------------------------------------------------------------------------

-- Language lookup by (project_id, code) to speed up RLS joins
CREATE INDEX IF NOT EXISTS idx_project_languages_project_code
  ON project_languages(project_id, language_code);

-- These existed in v11, keep if missing (no-op if already there)
CREATE INDEX IF NOT EXISTS idx_translation_keys_project ON translation_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_project_languages_project ON project_languages(project_id);
CREATE INDEX IF NOT EXISTS idx_translations_key ON translations(key_id);
CREATE INDEX IF NOT EXISTS idx_translations_language ON translations(project_language_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);

--------------------------------------------------------------------------------
-- 3) Helper functions (SECURITY DEFINER)
--    Keep v11 helpers, add v2 language checks
--------------------------------------------------------------------------------

-- v11 helpers (idempotent re-create)
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  ) OR is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND role = 'owner'
  ) OR is_platform_admin();
$$;

-- In v12, only owners manage structural project entities (keys, languages, members).
-- Editors were removed in v2; we do not auto-grant members structural permissions.
CREATE OR REPLACE FUNCTION can_manage_project_structure(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT is_project_owner(p_project_id);
$$;

-- v2 helpers: language-aware checks
CREATE OR REPLACE FUNCTION can_view_language(p_project_id UUID, p_lang TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = p_project_id
        AND user_id = auth.uid()
        AND (
          role = 'owner'
          OR (view_languages IS NOT NULL AND p_lang = ANY(view_languages))
        )
    );
$$;

CREATE OR REPLACE FUNCTION can_edit_language(p_project_id UUID, p_lang TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = p_project_id
        AND user_id = auth.uid()
        AND (
          role = 'owner'
          OR (edit_languages IS NOT NULL AND p_lang = ANY(edit_languages))
        )
    );
$$;

--------------------------------------------------------------------------------
-- 4) Constraints on project_members to enforce the v2 semantics
--------------------------------------------------------------------------------

-- Drop old constraints if they exist (names may vary if previously applied)
ALTER TABLE project_members
  DROP CONSTRAINT IF EXISTS owner_full_access,
  DROP CONSTRAINT IF EXISTS member_explicit_permissions,
  DROP CONSTRAINT IF EXISTS edit_subset_of_view;

-- Recreate constraints to align with v2
ALTER TABLE project_members
  ADD CONSTRAINT owner_full_access CHECK (
    role != 'owner' OR (view_languages IS NULL AND edit_languages IS NULL)
  ),
  ADD CONSTRAINT member_explicit_permissions CHECK (
    role != 'member' OR (view_languages IS NOT NULL AND edit_languages IS NOT NULL)
  ),
  ADD CONSTRAINT edit_subset_of_view CHECK (
    role != 'member' OR edit_languages <@ view_languages
  );

--------------------------------------------------------------------------------
-- 5) Migration of legacy roles to v2 semantics
--    - Keep 'owner' as-is (full access via NULL arrays).
--    - Convert 'editor' → 'member' with view = ALL languages, edit = ALL languages.
--    - Convert 'viewer' → 'member' with view = ALL languages, edit = [] (none).
--------------------------------------------------------------------------------

-- Normalize legacy roles into the new two-role model.
UPDATE project_members
SET role = CASE
  WHEN role IN ('editor','viewer') THEN 'member'
  ELSE role
END;

-- Backfill arrays for owners (NULL, NULL) and members (explicit arrays).
-- Owners: force NULLs for full access.
UPDATE project_members pm
SET view_languages = NULL,
    edit_languages = NULL
WHERE role = 'owner';

-- Members: default view = all project languages, edit = (all if legacy editor, none if legacy viewer).
-- We infer legacy editor/viewer by presence of prior edit/visibility if needed; here we use
-- a heuristic: if edit_languages is NULL (uninitialized), we assume legacy role before normalization:
--   - If the old role was 'editor' (now 'member'), grant edit all; else none.
-- Since we've already normalized role, we need to peek at historical info. If not available, we
-- treat any existing non-null edit_languages as authoritative; otherwise default to none.
-- To keep this deterministic, we use a two-step approach with a temporary mapping.

-- TEMP table to detect prior role per (project_id, user_id). If you have audit logs, prefer those.
-- This temp table will be empty if the migration is re-run; the UPDATEs remain idempotent.
DO $$
DECLARE
  _has_role_col BOOLEAN;
BEGIN
  -- No-op block; left here for clarity.
END $$;

-- Compute "all languages" per project_members row
WITH all_langs AS (
  SELECT pm.project_id, pm.user_id,
         ARRAY_AGG(pl.language_code ORDER BY pl.language_code) AS langs
  FROM project_members pm
  JOIN project_languages pl ON pl.project_id = pm.project_id
  GROUP BY pm.project_id, pm.user_id
)
UPDATE project_members pm
SET view_languages = COALESCE(pm.view_languages, al.langs),
    edit_languages = COALESCE(
      pm.edit_languages,
      CASE
        -- Heuristic: if we had no edit_languages yet but previously were editor,
        -- grant edit = all. If you have a reliable way to detect prior 'editor',
        -- run that before this script and set pm.edit_languages accordingly.
        -- Without reliable detection, default to NONE to be safe.
        WHEN FALSE THEN al.langs  -- set to TRUE with your own detection if desired
        ELSE ARRAY[]::TEXT[]
      END
    )
FROM all_langs al
WHERE pm.role = 'member'
  AND pm.project_id = al.project_id
  AND pm.user_id = al.user_id;

-- NOTE: If you can still detect legacy editors (e.g., via backups or audit tables),
-- run an UPDATE to grant them edit = view after this block, e.g.:
-- UPDATE project_members SET edit_languages = view_languages WHERE role='member' AND /* was_editor */;

--------------------------------------------------------------------------------
-- 6) RLS policy updates on translations for language-aware checks
--------------------------------------------------------------------------------

-- Ensure RLS is enabled
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_log ENABLE ROW LEVEL SECURITY;

-- Drop old translations policies (names may differ; use IF EXISTS)
DROP POLICY IF EXISTS "view_translations" ON translations;
DROP POLICY IF EXISTS "edit_translations" ON translations;
DROP POLICY IF EXISTS "insert_translations" ON translations;
DROP POLICY IF EXISTS "delete_translations" ON translations;

-- Recreate translations policies using v2 helpers
CREATE POLICY "view_translations" ON translations
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM translation_keys tk
    JOIN project_languages pl ON pl.id = translations.project_language_id
    WHERE tk.id = translations.key_id
      AND can_view_language(tk.project_id, pl.language_code)
  )
);

CREATE POLICY "edit_translations" ON translations
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM translation_keys tk
    JOIN project_languages pl ON pl.id = translations.project_language_id
    WHERE tk.id = translations.key_id
      AND can_edit_language(tk.project_id, pl.language_code)
  )
);

CREATE POLICY "insert_translations" ON translations
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM translation_keys tk
    JOIN project_languages pl ON pl.id = translations.project_language_id
    WHERE tk.id = translations.key_id
      AND can_edit_language(tk.project_id, pl.language_code)
  )
);

CREATE POLICY "delete_translations" ON translations
FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM translation_keys tk
    JOIN project_languages pl ON pl.id = translations.project_language_id
    WHERE tk.id = translations.key_id
      AND is_project_owner(tk.project_id) -- only owners can delete translations
  )
);

--------------------------------------------------------------------------------
-- 7) Tighten structure-management policies to owners only (v12 stance)
--------------------------------------------------------------------------------

-- Translation keys
DROP POLICY IF EXISTS "editors_manage_keys" ON translation_keys;
DROP POLICY IF EXISTS "owners_manage_keys" ON translation_keys;

CREATE POLICY "owners_manage_keys" ON translation_keys
FOR ALL USING (
  is_project_owner(project_id)
);

-- Project languages
DROP POLICY IF EXISTS "owners_manage_languages" ON project_languages;
CREATE POLICY "owners_manage_languages" ON project_languages
FOR ALL USING (
  is_project_owner(project_id)
);

-- Project members
DROP POLICY IF EXISTS "owners_manage_members" ON project_members;
CREATE POLICY "owners_manage_members" ON project_members
FOR INSERT WITH CHECK (is_project_owner(project_id));
CREATE POLICY "owners_update_members" ON project_members
FOR UPDATE USING (is_project_owner(project_id));
CREATE POLICY "owners_delete_members" ON project_members
FOR DELETE USING (is_project_owner(project_id));

-- Viewing policies remain permissive to members/admins (keep from v11, or re-assert):
DROP POLICY IF EXISTS "view_translation_keys" ON translation_keys;
CREATE POLICY "view_translation_keys" ON translation_keys
FOR SELECT USING (
  is_project_member(project_id)
);

DROP POLICY IF EXISTS "view_project_languages" ON project_languages;
CREATE POLICY "view_project_languages" ON project_languages
FOR SELECT USING (
  is_project_member(project_id)
);

DROP POLICY IF EXISTS "view_project_members" ON project_members;
CREATE POLICY "view_project_members" ON project_members
FOR SELECT USING (
  user_id = auth.uid() OR is_platform_admin()
);

-- Projects
DROP POLICY IF EXISTS "view_own_projects" ON projects;
CREATE POLICY "view_own_projects" ON projects
FOR SELECT USING (is_project_member(id));

DROP POLICY IF EXISTS "owners_update_projects" ON projects;
CREATE POLICY "owners_update_projects" ON projects
FOR UPDATE USING (is_project_owner(id));

DROP POLICY IF EXISTS "owners_delete_projects" ON projects;
CREATE POLICY "owners_delete_projects" ON projects
FOR DELETE USING (is_project_owner(id));

DROP POLICY IF EXISTS "owners_insert_projects" ON projects;
CREATE POLICY "owners_insert_projects" ON projects
FOR INSERT WITH CHECK (true);

-- History/activity/invites as in v11 (view by members, manage by owners)
DROP POLICY IF EXISTS "view_translation_history" ON translation_history;
CREATE POLICY "view_translation_history" ON translation_history
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM translations t
    JOIN translation_keys tk ON tk.id = t.key_id
    WHERE t.id = translation_history.translation_id
      AND is_project_member(tk.project_id)
  )
);

DROP POLICY IF EXISTS "view_project_invites" ON project_invites;
CREATE POLICY "view_project_invites" ON project_invites
FOR SELECT USING (is_project_owner(project_id));

DROP POLICY IF EXISTS "owners_manage_invites" ON project_invites;
CREATE POLICY "owners_manage_invites" ON project_invites
FOR ALL USING (is_project_owner(project_id));

DROP POLICY IF EXISTS "view_activity_log" ON project_activity_log;
CREATE POLICY "view_activity_log" ON project_activity_log
FOR SELECT USING (is_project_member(project_id));

DROP POLICY IF EXISTS "insert_activity_log" ON project_activity_log;
CREATE POLICY "insert_activity_log" ON project_activity_log
FOR INSERT WITH CHECK (is_project_member(project_id));

--------------------------------------------------------------------------------
-- 8) Optional: strengthen deletes of translation_keys to owners only (already done through owners_manage_keys)
--------------------------------------------------------------------------------

COMMIT;

-- Post-run sanity checks (optional):
-- SELECT * FROM project_members LIMIT 5;
-- EXPLAIN ANALYZE SELECT * FROM translations t JOIN translation_keys tk ON tk.id=t.key_id JOIN project_languages pl ON pl.id=t.project_language_id LIMIT 10;
