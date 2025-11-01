
# Translation Management System — Product Requirements Document (PRD) v12

> **Status:** Consolidated baseline. Merges v11 (full system spec) with v2 (per‑language access model) plus v12 refinements (owner-only structural control, indexing, performance notes). Suitable for clean installs and as the single source of truth going forward.

---

## 1) Overview

A web-based translation management platform to replace OneSky, letting teams import, manage, audit, and export multi‑language content for mobile and web apps. Includes project isolation, fine-grained per‑language permissions, AI-assisted translation, and robust auditability.

## 2) Problem Statement

OneSky’s shutdown removed our managed translation workflow. Current pain points:
- Lost access to historical translations (now in MariaDB exports)
- Manual JSON file edits for new/updated strings
- Slow, error-prone app store text updates
- No central translation memory or audit trail

## 3) Solution Summary

Build an internal TMS to:
- Import existing translations
- Provide a grid UI for editing across languages
- Enforce role- and language-aware access control (RLS in Postgres/Supabase)
- Export per-language JSON and ZIP bundles
- Maintain audit history and activity logs
- Invite collaborators with scoped permissions

## 4) Target Users

- **Primary:** Development leads, developers
- **Secondary:** Translators, project managers

---

## 5) MVP Features

### 5.1 Data Import
**User Story:** As a developer, I can import existing data to recover translations.  
**Acceptance:**
- Parse MariaDB dump / structured JSON payloads per language
- English acts as source of truth for key structure
- Correctly handle Unicode across all languages

### 5.2 Translation Grid
**User Story:** As a user, I can view/edit translations in a grid.  
**Acceptance:**
- Rows = keys, Columns = languages
- Inline editing with optimistic UI
- Highlight missing values
- Add new keys
- Respect per‑language permissions (columns hidden or read-only as needed)

### 5.3 Add New Key with AI Fill
**User Story:** As an editor, I can add a key (EN value) and auto-fill the rest.  
**Acceptance:**
- Create key + EN value
- AI backfill for active project languages (editable afterward)
- Appears immediately in grid

### 5.4 Export
**User Story:** As a developer, I can export translations for builds.  
**Acceptance:**
- Per-language JSON
- All languages as ZIP
- UTF-8 JSON with nested structure restored (from dot-notation keys)
- Enforce consistent keysets across languages (based on EN)

### 5.5 Invite & Onboarding
**User Story:** As an owner, I can invite members with scoped permissions.  
**Acceptance:**
- Email invite with magic link
- Role: owner/member
- For members, select `view_languages[]` and `edit_languages[]`
- Expiring invites, activity log entries

---

## 6) Non-MVP (Phase 2+)

- Bulk EN JSON import with diff detection
- Real-time collaboration (presence, conflict resolution)
- Advanced search/filter (regex, missing-only, changed-only)
- Translation memory & suggestions
- CI/CD hooks for auto-export
- Custom roles (beyond owner/member)
- Quality scoring & validation rules
- Analytics dashboard

---

## 7) Technical Requirements

### 7.1 Technology Stack
- **DB/Auth:** Supabase (PostgreSQL + RLS + Supabase Auth)
- **Frontend:** Web app (React preferred)
- **AI Translation:** OpenAI API or Google Translate
- **Exports:** JSON (UTF-8) + ZIP bundling

### 7.2 Database Schema (DDL)

```sql
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

-- Translation Keys (dot-notation, e.g. "about.title")
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

-- Project Members (v12: owner/member + per-language arrays)
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'member'
  view_languages TEXT[], -- NULL = full access (owners/admins)
  edit_languages TEXT[], -- NULL = full access (owners/admins)
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Platform Admins (global bypass)
CREATE TABLE platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Translation History (audit trail)
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
  role TEXT NOT NULL,                 -- 'owner' or 'member'
  view_languages TEXT[],              -- required for 'member'; NULL for 'owner'
  edit_languages TEXT[],              -- required for 'member'; NULL for 'owner'
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
  action TEXT NOT NULL,  -- 'member_added', 'bulk_import', etc.
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 7.3 Constraints

```sql
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
```

### 7.4 Indexes

```sql
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
```

### 7.5 Helper Functions

```sql
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  ) OR is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = 'owner'
  ) OR is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION can_view_language(p_project_id UUID, p_lang TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
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
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
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
```

### 7.6 Triggers (Audit)

```sql
CREATE OR REPLACE FUNCTION log_translation_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.value IS DISTINCT FROM NEW.value) THEN
    INSERT INTO translation_history (translation_id, old_value, new_value, updated_by)
    VALUES (NEW.id, OLD.value, NEW.value, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER translation_audit_trigger
  AFTER UPDATE ON translations
  FOR EACH ROW
  EXECUTE FUNCTION log_translation_change();
```

### 7.7 Row-Level Security (RLS)

```sql
-- Enable RLS
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

-- Activity Log
CREATE POLICY view_activity_log ON project_activity_log
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY insert_activity_log ON project_activity_log
  FOR INSERT WITH CHECK (is_project_member(project_id));
```

---

## 8) Frontend Enforcement

- Gate all project routes by verifying `project_members` (redirect on 401/403).
- Derive user capabilities client-side:
  ```ts
  const isAdmin = session.roles.includes('platform_admin'); // from backend claim
  const isOwner = member.role === 'owner';
  const view = isAdmin || isOwner ? ALL_LANGS : member.view_languages;
  const edit = isAdmin || isOwner ? ALL_LANGS : member.edit_languages;
  ```
- **Grid UX:**
  - Hide columns ∉ `view`
  - Mark columns read-only if `lang ∉ edit`
  - Tooltips for restricted cells (“Not in your assigned languages”)
- **Member Management UI (owners only):**
  - Select `view_languages[]`, then select `edit_languages[] ⊆ view`
  - Default new member: `view=['en']`, `edit=[]`
- **Error handling:** If API rejects due to RLS, show toast and re-fetch member profile.

---

## 9) User Flows

### 9.1 Import
1. Upload structured payload / MariaDB dump
2. Parse → keys + per-language values
3. Upsert keys & translations
4. Log activity

### 9.2 Edit
1. Open grid → fetch allowed languages
2. Inline edit allowed cells
3. Persist; audit trigger writes history

### 9.3 Add New Key
1. Enter key + EN value
2. Create key + EN translation
3. AI backfill others
4. Grid updates

### 9.4 Export
1. Select language(s)
2. Generate JSON/ZIP
3. Log activity

### 9.5 Invite
1. Owner inputs email + role + languages
2. Create invite row + send link
3. Accept → create project_member
4. Log activity

---

## 10) Authentication & Sessions

- Supabase Auth (email/password + optional magic links)
- Require email verification
- Session TTL ~7 days with rolling refresh
- Optional TOTP MFA (when supported)
- Rate limit auth endpoints

---

## 11) Audit & Monitoring

- `translation_history` via trigger
- `project_activity_log` for key events (invite, bulk import/export, role changes)
- Surface activity timeline to owners
- Include actor and timestamp across logs

---

## 12) Performance Considerations

- Indices listed above are required
- RLS joins for translations: `translations → translation_keys → project_languages`
  - Frontend MUST filter by allowed languages to reduce result set
  - Consider materialized views or read replicas if datasets grow large
- Keep keys flattened (dot-notation) for storage; reconstruct nested JSON at export

---

## 13) Success Metrics

- Historical data imported successfully
- 0 critical permission escalations or leaks (verified by tests)
- Export pipeline integrated in app builds
- AI backfill reduces manual work (>70% coverage), with human touch-up
- P95 export time < 5s for 1k keys × 10 languages

---

## 14) Open Questions / Later Decisions

- Translation memory strategy & storage
- Custom role builder beyond owner/member
- Automated QA checks (placeholders, HTML tags, ICU plural rules)
- Multi-workspace tenancy (single DB vs schema-per-tenant vs row scoping)

---

## 15) Appendix: Example Queries

**Fetch visible translations for current user in project + specific languages (UI pre-filtered):**
```sql
SELECT t.id, tk.key, pl.language_code, t.value
FROM translations t
JOIN translation_keys tk ON tk.id = t.key_id
JOIN project_languages pl ON pl.id = t.project_language_id
WHERE tk.project_id = :project_id
  AND pl.language_code = ANY(:visible_langs); -- computed client-side
```

**Insert a new key + EN value (owner/member with edit 'en'):**
```sql
WITH new_key AS (
  INSERT INTO translation_keys (project_id, key)
  VALUES (:project_id, :key)
  ON CONFLICT (project_id, key) DO UPDATE SET key = EXCLUDED.key
  RETURNING id
)
INSERT INTO translations (key_id, project_language_id, value, updated_by)
SELECT nk.id, pl.id, :en_value, auth.uid()
FROM new_key nk
JOIN project_languages pl ON pl.project_id = :project_id AND pl.language_code = 'en'
ON CONFLICT (key_id, project_language_id) DO UPDATE SET value = EXCLUDED.value;
```
