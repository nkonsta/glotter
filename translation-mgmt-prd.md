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
  UNIQUE(key_id, project_language_id)
);

-- Indexes for better query performance
CREATE INDEX idx_translation_keys_project ON translation_keys(project_id);
CREATE INDEX idx_project_languages_project ON project_languages(project_id);
CREATE INDEX idx_translations_key ON translations(key_id);
CREATE INDEX idx_translations_language ON translations(project_language_id);
```

**Key Design Decisions:**
- Translation keys stored as flat dot-notation strings (e.g., "aboutPage.title") for simplicity
- Nested JSON structure reconstructed during export
- project_languages table manages which languages are active per project
- Foreign key references ensure data integrity and cascading deletes

### Technology Stack
- **Backend:** Supabase (PostgreSQL + auto-generated APIs)
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
5. Confirmation message with import summary

### Edit Translation Flow
1. User navigates to translation grid
2. User clicks on translation cell
3. Inline editor opens
4. User edits and saves
5. Database updates immediately

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
4. User downloads file(s)

---

## Success Metrics
- Successful import of existing translation data
- Ability to add and edit translations without manual JSON editing
- Successful export and integration with existing app build process
- 90%+ accuracy of AI-generated translations (manual review acceptable)

## Future Considerations (Post-MVP)
- Bulk EN JSON import with diff detection
- User authentication and project permissions
- Translation version history
- Collaboration features for translators
- Integration with CI/CD pipelines

---

## Timeline
**Target: 2-3 weeks for MVP**
- Week 1: Database setup, import functionality
- Week 2: Translation grid and editing interface
- Week 3: AI translation integration, export functionality, testing