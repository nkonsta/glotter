# Translation Management System - Product Requirements Document (PRD)

## Overview
A web-based translation management system to replace OneSky functionality, allowing teams to manage, edit, and export multi-language translations for mobile and web applications.

## Problem Statement
With OneSky's shutdown, our team lost access to existing translations and the ability to efficiently manage multi-language content. Currently facing:
- No access to existing translations (stored in MariaDB)
- Manual JSON file editing for new translations
- Time-consuming process to update app store submissions
- No centralized translation management

## Solution
Build a custom translation management platform that imports existing data, provides collaborative editing interface, and exports to required formats.

## Target Users
- Development teams managing multi-language applications
- Primary: Development leads and developers
- Secondary: Translators and project managers

---

## MVP Features

### 1. Data Import
**User Story:** As a developer, I want to import my existing translation data so I can recover lost translations.

**Acceptance Criteria:**
- Import translations from MariaDB export
- Parse JSON blobs per language
- Use English as source language (defines key structure)
- Handle Unicode/non-ASCII characters properly

### 2. Translation Grid Interface
**User Story:** As a developer, I want to view and edit all translations in one place so I can efficiently manage content.

**Acceptance Criteria:**
- Grid view: translation keys as rows, languages as columns
- Inline editing of translation values
- Highlight missing translations (empty cells)
- Support Unicode characters in all languages
- Add new translation key functionality

### 3. Add New Translation Key
**User Story:** As a developer, I want to add new keys and get automatic translations so I can quickly expand app content.

**Acceptance Criteria:**
- Form to add new translation key with English value
- Auto-generate translations for all other project languages using AI
- Insert new key across all languages in database
- New translations appear immediately in grid

### 4. Export Functionality
**User Story:** As a developer, I want to download translation files so I can integrate them into my app build process.

**Acceptance Criteria:**
- Export individual language as JSON file
- Export all languages as ZIP file
- Ensure all languages contain same keys (based on English)
- Proper JSON formatting with UTF-8 encoding

---

## Technical Requirements

### Database Schema
```sql
-- Table 1: Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table 2: Languages per project
CREATE TABLE project_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL, -- 'en', 'es', 'fr', etc.
  language_name TEXT, -- 'English', 'Spanish', 'French'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, language_code)
);

-- Table 3: Translation Keys (stored as dot-notation, e.g., "aboutPage.title")
CREATE TABLE translation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, key)
);

-- Table 4: Translations (actual text in each language)
CREATE TABLE translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES translation_keys(id) ON DELETE CASCADE,
  project_language_id UUID REFERENCES project_languages(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(key_id, project_language_id)
);

-- Table 5: Project Members
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'owner', 'editor', 'viewer'
  allowed_languages TEXT[], -- NULL = all languages, ['en','es'] = specific languages only
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Table 6: Platform Admins
CREATE TABLE platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table 7: Translation History (Audit Trail)
CREATE TABLE translation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_id UUID REFERENCES translations(id) ON DELETE CASCADE,
  old_value TEXT,
  new_value TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table 8: Project Invites
CREATE TABLE project_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  allowed_languages TEXT[], -- NULL = all languages
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMP,
  UNIQUE(project_id, email)
);

-- Table 9: Project Activity Log
CREATE TABLE project_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'member_added', 'bulk_import', 'bulk_export', 'role_changed', etc.
  metadata JSONB, -- Additional context about the action
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_translation_keys_project ON translation_keys(project_id);
CREATE INDEX idx_project_languages_project ON project_languages(project_id);
CREATE INDEX idx_translations_key ON translations(key_id);
CREATE INDEX idx_translations_language ON translations(project_language_id);
CREATE INDEX idx_project_members_user ON project_members(user_id, project_id);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_translation_history_translation ON translation_history(translation_id);
CREATE INDEX idx_project_activity_log_project ON project_activity_log(project_id);
CREATE INDEX idx_project_invites_email ON project_invites(email);
```

**Key Design Decisions:**
- Translation keys stored as flat dot-notation strings (e.g., "aboutPage.title") for simplicity
- Nested JSON structure reconstructed during export
- `allowed_languages` NULL = all languages, array = specific languages only
- Full audit trail via translation_history table with automatic trigger
- Project invites table for email-based onboarding with 7-day expiration
- Project activity log for tracking critical operations
- Comprehensive indexes for optimal query performance
- Automatic audit logging via PostgreSQL trigger

### Technology Stack
- **Backend:** Supabase (PostgreSQL + RLS + auto-generated APIs)
- **Frontend:** Web application (framework TBD)
- **AI Translation:** OpenAI API or Google Translate API
- **File Handling:** JSON export with UTF-8 encoding

### Performance Requirements
- Support projects with 1000+ translation keys
- Handle 10+ languages per project
- Export generation < 5 seconds

---

## User Flows

### Import Flow
1. User uploads/pastes MariaDB export data
2. System parses JSON per language
3. Creates translation_keys based on English keys
4. Populates translations table for all languages
5. Logs activity in project_activity_log
6. Confirmation message with import summary

### Edit Translation Flow
1. User navigates to translation grid
2. User clicks on translation cell
3. Inline editor opens
4. User edits and saves
5. Database updates immediately (with audit trail via trigger)

### Add New Key Flow
1. User clicks "Add New Key" button
2. User enters key name and English value
3. System creates translation_key record
4. System calls AI API to translate to other languages
5. System creates translation records for all languages
6. Grid updates with new row

### Export Flow
1. User selects export option (single language or all)
2. System queries database for project translations
3. System generates JSON file(s)
4. Logs activity in project_activity_log
5. User downloads file(s)

### Invite Flow
1. Owner enters email and selects role/allowed languages
2. System creates record in project_invites
3. Email sent with magic link (valid 7 days)
4. User clicks link, signs up/signs in
5. System creates project_members record
6. Logs activity in project_activity_log

---

## Success Metrics
- Successful import of existing translation data
- Ability to add and edit translations without manual JSON editing
- Successful export and integration with existing app build process
- 90%+ accuracy of AI-generated translations (manual review acceptable)

## Authentication & Access Control

### User Roles and Permissions
| Role | Scope | Capabilities |
|------|--------|---------------|
| **Admin** | Global | Manage all projects, users, and roles. Full platform access. |
| **Owner** | Project | Full control over their project. Can manage members, add/remove languages, delete project, edit all translations. Multiple owners allowed per project. |
| **Editor** | Project (language subset) | Can edit translations for specific assigned languages only. Cannot change project structure or manage members. |
| **Viewer** | Project (language subset) | Read-only. Can view and export assigned languages only. No edits or project management. |

**Note:** `allowed_languages` NULL means access to all project languages. Specific array restricts to those languages only.

### Authorization Rules
**Owners:**
- CRUD on projects, languages, translation keys, translations
- Manage project members and their roles (promote/demote, revoke access)
- Initiate imports/exports and set AI translation provider credentials
- View project activity log

**Editors:**
- CRUD on translation keys within assigned projects
- Edit translation values for allowed languages only
- Trigger AI translation for missing values
- Run exports but cannot delete projects or change member roles

**Viewers:**
- Read-only access to grid for allowed languages
- Export single language/all allowed languages
- No permission to edit or trigger imports/exports that modify data

**Platform Admins:**
- Full access to all projects and operations
- Can manage platform_admins table
- Override all RLS policies

### Authentication Requirements
- Primary auth via Supabase Auth email/password; require email verification before granting project access
- Support Supabase magic links for users who prefer passwordless sign-in (configurable per workspace)
- Provide password reset via secure email link; links expire after 30 minutes
- Enforce minimum password rules (12 chars, uppercase/lowercase, numeric or symbol)
- Supabase rate limits on login/forgot password endpoints
- Sessions persist for 7 days with rolling refresh tokens
- Automatically revoke on password change or explicit sign out
- Option to enable TOTP-based MFA per user (post-MVP toggle)

### Row Level Security (RLS)

#### Helper Functions (SECURITY DEFINER to prevent infinite recursion)
```sql
-- Function to check if user is project member
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
    AND user_id = auth.uid()
  );
$;

-- Function to check if user is project owner
CREATE OR REPLACE FUNCTION is_project_owner(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
    AND user_id = auth.uid()
    AND role = 'owner'
  );
$;

-- Function to check if user is editor or owner
CREATE OR REPLACE FUNCTION can_edit_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'editor')
  );
$;

-- Function to check if user is platform admin
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
  );
$;
```

#### RLS Policies
```sql
-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_log ENABLE ROW LEVEL SECURITY;

-- Projects Policies
CREATE POLICY "view_own_projects" ON projects
  FOR SELECT USING (
    is_project_member(id) OR is_platform_admin()
  );

CREATE POLICY "owners_update_projects" ON projects
  FOR UPDATE USING (
    is_project_owner(id) OR is_platform_admin()
  );

CREATE POLICY "owners_delete_projects" ON projects
  FOR DELETE USING (
    is_project_owner(id) OR is_platform_admin()
  );

CREATE POLICY "owners_insert_projects" ON projects
  FOR INSERT WITH CHECK (true);

-- Project Languages Policies
CREATE POLICY "view_project_languages" ON project_languages
  FOR SELECT USING (
    is_project_member(project_id) OR is_platform_admin()
  );

CREATE POLICY "owners_manage_languages" ON project_languages
  FOR ALL USING (
    is_project_owner(project_id) OR is_platform_admin()
  );

-- Translation Keys Policies
CREATE POLICY "view_translation_keys" ON translation_keys
  FOR SELECT USING (
    is_project_member(project_id) OR is_platform_admin()
  );

CREATE POLICY "editors_manage_keys" ON translation_keys
  FOR ALL USING (
    can_edit_project(project_id) OR is_platform_admin()
  );

-- Translations Policies
CREATE POLICY "view_translations" ON translations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM translation_keys tk
      WHERE tk.id = translations.key_id
      AND (is_project_member(tk.project_id) OR is_platform_admin())
    )
  );

CREATE POLICY "edit_translations" ON translations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM translation_keys tk
      WHERE tk.id = translations.key_id
      AND (can_edit_project(tk.project_id) OR is_platform_admin())
    )
  );

CREATE POLICY "insert_translations" ON translations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM translation_keys tk
      WHERE tk.id = translations.key_id
      AND (can_edit_project(tk.project_id) OR is_platform_admin())
    )
  );

CREATE POLICY "delete_translations" ON translations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM translation_keys tk
      WHERE tk.id = translations.key_id
      AND (is_project_owner(tk.project_id) OR is_platform_admin())
    )
  );

-- Project Members Policies (avoid infinite recursion)
CREATE POLICY "view_project_members" ON project_members
  FOR SELECT USING (
    user_id = auth.uid() OR is_platform_admin()
  );

CREATE POLICY "owners_manage_members" ON project_members
  FOR INSERT WITH CHECK (
    is_project_owner(project_id) OR is_platform_admin()
  );

CREATE POLICY "owners_update_members" ON project_members
  FOR UPDATE USING (
    is_project_owner(project_id) OR is_platform_admin()
  );

CREATE POLICY "owners_delete_members" ON project_members
  FOR DELETE USING (
    is_project_owner(project_id) OR is_platform_admin()
  );

-- Platform Admins Policies
CREATE POLICY "admins_view_admins" ON platform_admins
  FOR SELECT USING (is_platform_admin());

CREATE POLICY "admins_manage_admins" ON platform_admins
  FOR ALL USING (is_platform_admin());

-- Translation History Policies
CREATE POLICY "view_translation_history" ON translation_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM translations t
      JOIN translation_keys tk ON tk.id = t.key_id
      WHERE t.id = translation_history.translation_id
      AND (is_project_member(tk.project_id) OR is_platform_admin())
    )
  );

-- Project Invites Policies
CREATE POLICY "view_project_invites" ON project_invites
  FOR SELECT USING (
    is_project_owner(project_id) OR is_platform_admin()
  );

CREATE POLICY "owners_manage_invites" ON project_invites
  FOR ALL USING (
    is_project_owner(project_id) OR is_platform_admin()
  );

-- Project Activity Log Policies
CREATE POLICY "view_activity_log" ON project_activity_log
  FOR SELECT USING (
    is_project_member(project_id) OR is_platform_admin()
  );

CREATE POLICY "insert_activity_log" ON project_activity_log
  FOR INSERT WITH CHECK (
    is_project_member(project_id) OR is_platform_admin()
  );
```

**Note on Language-Level Access Control:**
The `allowed_languages` column in `project_members` is maintained in the schema for future use, but fine-grained language restrictions are currently enforced at the application layer rather than in RLS policies. This design choice prevents infinite recursion in RLS policies while maintaining security for core project isolation and role-based access control. Language-level restrictions can be added back via additional SECURITY DEFINER functions if needed in the future.

### Stored Procedures for Complex Operations
```sql
-- Audit trigger for translation changes
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

-- Secure import function
CREATE OR REPLACE FUNCTION sync_import(
  p_project_id UUID,
  p_payload JSONB -- structured object with keys/language/value arrays
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Check permissions
  SELECT role INTO v_role
  FROM project_members
  WHERE project_id = p_project_id
    AND user_id = auth.uid();

  IF v_role NOT IN ('owner', 'editor') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Upsert keys and translations in a transaction
  -- (Implementation of sync_translation_payload would go here)
  
  -- Log activity
  INSERT INTO project_activity_log (project_id, user_id, action, metadata)
  VALUES (p_project_id, auth.uid(), 'bulk_import', jsonb_build_object('keys_count', jsonb_array_length(p_payload->'keys')));

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
```

### Frontend Enforcement
- Gate project routes with loader that fetches `project_members` entry
- Redirect unauthenticated users to sign-in
- Inject role into global state (React context/Zustand) to toggle UI controls
- Wrap mutation hooks with guard that aborts if user role lacks permission
- Display inline toast prompting Owner contact when permission denied
- On 401/403 responses, automatically clear session and redirect to login (401) or show permission denied screen (403)
- Ensure invite accept screen only accessible via magic link token
- Show informative error if token expired or already used

### Authentication & Authorization Flows
1. **Sign-in**: user enters email/password → Supabase Auth returns session → store in secure HTTP-only cookie
2. **Invite**: Owner provides email → system creates project_invites record → email with magic link → upon acceptance, user stored in project_members
3. **Session Refresh**: client silently refreshes before expiry; on failure, redirect to login
4. **Role Change**: Owner updates role → backend function updates project_members → log activity → invalidate affected user sessions
5. **Logout**: client clears cookie, calls Supabase sign-out; server revokes refresh token

### Audit & Monitoring
- Supabase Auth logs and Postgres WAL backups enabled
- Translation changes tracked in translation_history (automatic trigger)
- Critical events logged in project_activity_log (member changes, bulk imports/exports)
- Activity log surfaced in UI to Owners for transparency
- All logs include actor (user_id) and timestamp

### Performance Considerations
- Comprehensive indexes on foreign keys and commonly queried columns
- Helper view (project_membership) to simplify RLS policies
- Consider materialized views for complex permission checks at scale
- Automatic cleanup job for expired invites via scheduled function

---

## Future Considerations (Post-MVP)
- Bulk EN JSON import with diff detection
- Real-time collaboration with presence indicators
- Advanced search and filtering in translation grid
- Translation memory and suggestions
- CI/CD integration for automated exports
- Custom role creation with fine-grained permissions
- Translation quality scoring and validation rules
- Automated cleanup job for expired invites
- Activity dashboard and analytics
- TOTP MFA support when Supabase supports it natively

---

## Timeline
**Target: 2-3 weeks for MVP**
- Week 1: Database setup, import functionality, basic auth
- Week 2: Translation grid and editing interface, RLS policies
- Week 3: AI translation integration, export functionality, invite system, testing