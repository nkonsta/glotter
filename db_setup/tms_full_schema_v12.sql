
-- Translation Management System – Full Schema v12
-- Clean install baseline: merges v11 structure + v2 per-language ACL + v12 optimizations
-- Compatible with Supabase (Postgres + Auth)

BEGIN;

--------------------------------------------------------------------------------
-- 1) Core Tables
--------------------------------------------------------------------------------

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Project Languages
CREATE TABLE project_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL, -- 'en', 'es', etc.
  language_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, language_code)
);

-- Translation Keys
CREATE TABLE translation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, key)
);

-- Translations
CREATE TABLE translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES translation_keys(id) ON DELETE CASCADE,
  project_language_id UUID REFERENCES project_languages(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(key_id, project_language_id)
);

-- Project Members
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'member'
  view_languages TEXT[], -- NULL = all (owners/admins)
  edit_languages TEXT[], -- NULL = all (owners/admins)
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Platform Admins
CREATE TABLE platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Translation History
CREATE TABLE translation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_id UUID REFERENCES translations(id) ON DELETE CASCADE,
  old_value TEXT,
  new_value TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Project Invites
CREATE TABLE project_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  view_languages TEXT[],
  edit_languages TEXT[],
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMP,
  UNIQUE(project_id, email)
);

-- Project Activity Log
CREATE TABLE project_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

--------------------------------------------------------------------------------
-- 2) Constraints for Access Model
--------------------------------------------------------------------------------

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
-- 3) Indexes
--------------------------------------------------------------------------------

CREATE INDEX idx_translation_keys_project ON translation_keys(project_id);
CREATE INDEX idx_project_languages_project ON project_languages(project_id);
CREATE INDEX idx_project_languages_project_code ON project_languages(project_id, language_code);
CREATE INDEX idx_translations_key ON translations(key_id);
CREATE INDEX idx_translations_language ON translations(project_language_id);
CREATE INDEX idx_project_members_user ON project_members(user_id, project_id);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_translation_history_translation ON translation_history(translation_id);
CREATE INDEX idx_project_activity_log_project ON project_activity_log(project_id);
CREATE INDEX idx_project_invites_email ON project_invites(email);

--------------------------------------------------------------------------------
-- 4) Helper Functions
--------------------------------------------------------------------------------

-- All helpers are SECURITY DEFINER with a pinned, empty search_path and
-- fully-qualified names to prevent search_path injection (Supabase lint 0011).

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  ) OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'owner'
  ) OR public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION can_view_language(p_project_id UUID, p_lang TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '' AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = p_project_id
        AND user_id = auth.uid()
        AND (
          role = 'owner'
          OR (view_languages IS NOT NULL AND p_lang = ANY(view_languages))
        )
    );
$$;

CREATE OR REPLACE FUNCTION can_edit_language(p_project_id UUID, p_lang TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = '' AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = p_project_id
        AND user_id = auth.uid()
        AND (
          role = 'owner'
          OR (edit_languages IS NOT NULL AND p_lang = ANY(edit_languages))
        )
    );
$$;

--------------------------------------------------------------------------------
-- 5) Audit Trigger
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_translation_change()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.value IS DISTINCT FROM NEW.value) THEN
    INSERT INTO public.translation_history (translation_id, old_value, new_value, updated_by)
    VALUES (NEW.id, OLD.value, NEW.value, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER translation_audit_trigger
  AFTER UPDATE ON translations
  FOR EACH ROW
  EXECUTE FUNCTION log_translation_change();

--------------------------------------------------------------------------------
-- 6) Row-Level Security
--------------------------------------------------------------------------------

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_log ENABLE ROW LEVEL SECURITY;

-- Projects
CREATE POLICY view_own_projects ON projects
  FOR SELECT USING (is_project_member(id));
CREATE POLICY owners_update_projects ON projects
  FOR UPDATE USING (is_project_owner(id));
CREATE POLICY owners_delete_projects ON projects
  FOR DELETE USING (is_project_owner(id));
CREATE POLICY owners_insert_projects ON projects
  FOR INSERT WITH CHECK (true);

-- Project Languages
CREATE POLICY view_project_languages ON project_languages
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY owners_manage_languages ON project_languages
  FOR ALL USING (is_project_owner(project_id));

-- Translation Keys
CREATE POLICY view_translation_keys ON translation_keys
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY owners_manage_keys ON translation_keys
  FOR ALL USING (is_project_owner(project_id));

-- Translations (language-aware)
CREATE POLICY view_translations ON translations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM translation_keys tk
      JOIN project_languages pl ON pl.id = translations.project_language_id
      WHERE tk.id = translations.key_id
        AND can_view_language(tk.project_id, pl.language_code)
    )
  );

CREATE POLICY edit_translations ON translations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM translation_keys tk
      JOIN project_languages pl ON pl.id = translations.project_language_id
      WHERE tk.id = translations.key_id
        AND can_edit_language(tk.project_id, pl.language_code)
    )
  );

CREATE POLICY insert_translations ON translations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM translation_keys tk
      JOIN project_languages pl ON pl.id = translations.project_language_id
      WHERE tk.id = translations.key_id
        AND can_edit_language(tk.project_id, pl.language_code)
    )
  );

CREATE POLICY delete_translations ON translations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM translation_keys tk
      WHERE tk.id = translations.key_id
        AND is_project_owner(tk.project_id)
    )
  );

-- Project Members
CREATE POLICY view_project_members ON project_members
  FOR SELECT USING (user_id = auth.uid() OR is_platform_admin());
CREATE POLICY owners_manage_members ON project_members
  FOR INSERT WITH CHECK (is_project_owner(project_id));
CREATE POLICY owners_update_members ON project_members
  FOR UPDATE USING (is_project_owner(project_id));
CREATE POLICY owners_delete_members ON project_members
  FOR DELETE USING (is_project_owner(project_id));

-- Platform Admins
CREATE POLICY admins_view_admins ON platform_admins
  FOR SELECT USING (is_platform_admin());
CREATE POLICY admins_manage_admins ON platform_admins
  FOR ALL USING (is_platform_admin());

-- Translation History
CREATE POLICY view_translation_history ON translation_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM translations t
      JOIN translation_keys tk ON tk.id = t.key_id
      WHERE t.id = translation_history.translation_id
        AND is_project_member(tk.project_id)
    )
  );

-- Project Invites
CREATE POLICY view_project_invites ON project_invites
  FOR SELECT USING (is_project_owner(project_id));
CREATE POLICY owners_manage_invites ON project_invites
  FOR ALL USING (is_project_owner(project_id));

-- Project Activity Log
CREATE POLICY view_activity_log ON project_activity_log
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY insert_activity_log ON project_activity_log
  FOR INSERT WITH CHECK (is_project_member(project_id));

COMMIT;
