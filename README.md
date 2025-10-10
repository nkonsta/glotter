# Glotter – Translation Management

A Next.js-based web application for managing multi-language translations. Features an accessible UI, inline editing, JSON export, and a Supabase backend.

---

## 🎯 Features

### ✅ Translation Grid Interface
- **Grid View**: Translation keys as rows, languages as columns
- **Inline Editing**: Click any cell to edit, Enter to save, Escape to cancel
- **Missing Translation Indicators**: Empty cells highlighted visually
- **Real-time Updates**: Changes saved immediately to Supabase
- **Performance**: Optimized for thousands of keys; pagination included

### ✅ Project Management
- **Project Selector**: Dropdown to switch between projects
- **Language Display**: Shows language codes and names in headers

### ✅ Data Layer
- **Efficient Queries**: Parallel fetching of languages and translations
- **Type Safety**: Full TypeScript support
- **Error Handling**: Graceful error messages for common issues

---

## 🚀 Quick Start

### 1. Configure Supabase

Copy the example environment file and fill in your Supabase credentials:

```bash
cp env.example .env.local
```

Then edit `.env.local` with your actual Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here
```

How to get these:
1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy "Project URL" → Use as `NEXT_PUBLIC_SUPABASE_URL`
4. Copy "anon public" key → Use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Open Browser

Navigate to http://localhost:3000

---

## 📁 Project Structure

```
glotter/
├── app/
│   ├── page.tsx                    # Main application page
│   ├── layout.tsx                  # App layout
│   └── globals.css                 # Global styles & theme tokens
├── components/
│   ├── TranslationGrid.tsx         # Grid component with inline editing
│   ├── ThemeToggle.tsx             # Theme toggle (useSyncExternalStore)
│   └── ui/                         # UI primitives (Button, Dialog, Dropdown, Skeleton, Tooltip, SegmentedControl, Spinner)
├── lib/
│   ├── supabase.ts                 # Supabase client configuration
│   ├── translations.ts             # Database query functions
│   └── theme.ts                    # Theme store (persistence + system preference)
├── .env.local                      # Environment variables (create this)
├── package.json                    # Dependencies
└── README.md                       # This file
```

---

## 🎨 Theming & Accessibility

- Light/dark tokens defined in `app/globals.css` and applied to `:root`.
- Theme is persisted to `localStorage` and synced via `lib/theme.ts`.
- Visible focus rings; interactive components use Radix for accessibility.
- UI primitives documented in `components/ui/README.md`.

---

## 📖 Usage

### Onboarding: Projects & Languages
1. Create a project
   - From the header Project dropdown, choose "New project…" (or use the empty‑state button).
   - Enter a project name and optional initial languages (comma‑separated codes, e.g. `en, fr, de` or code:name pairs like `en:English`). Codes are normalized to lowercase.
   - The app adds at least one language (defaults to `en`).
2. Manage languages for a project
   - From the Project dropdown (or the Columns menu footer), select "Manage languages…".
   - Add a language by code (e.g. `pt-br`) and optional display name. Codes are normalized to lowercase. You can edit a language's name later in "Manage languages…".
   - Remove a language to delete all its translations in this project.
   - You cannot remove the last remaining language; add another first.
3. Delete a project
   - From the Project dropdown, select "Delete project…".
   - Type the project name to confirm. This removes the project, its languages, keys, and translations.

### Viewing Translations
1. Select a project from the dropdown
2. View translation keys and their values across languages
3. Missing translations are visually highlighted
4. See translation and language counts at the top

### Editing Translations
1. Click any cell to edit
2. Type your changes
3. Press Enter to save or Escape to cancel
4. Changes are immediately saved to Supabase (optimistic UI)

### Adding New Keys
Use the "+ Add New Key" button in the toolbar to create a key in the selected project. The grid refreshes after creation.

### Exporting
Use the Export menu to download:
- All languages (single JSON)
- Individual language JSON files

---

## 🗄️ Database Schema

The application expects these tables in Supabase:

### projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### project_languages
```sql
CREATE TABLE project_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  language_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, language_code)
);
```

### translation_keys
```sql
CREATE TABLE translation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, key)
);
```

### translations
```sql
CREATE TABLE translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES translation_keys(id) ON DELETE CASCADE,
  project_language_id UUID REFERENCES project_languages(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(key_id, project_language_id)
);
```

---

## ✅ Testing Checklist

- [ ] App loads without errors
- [ ] Projects appear in dropdown
- [ ] Translation grid displays keys and values
- [ ] Can click a cell to edit
- [ ] Changes save when pressing Enter
- [ ] Edits cancel when pressing Escape
- [ ] Missing translations show visual highlight
- [ ] Can switch between projects
- [ ] Performance is smooth with thousands of keys

### CRUD Flow (Projects & Languages)
- [ ] Create a project (with and without custom initial languages)
- [ ] Selected project auto-loads languages and empty grid
- [ ] Add a language (e.g., `fr`) and see column appear after reload
- [ ] Remove a language and confirm its column/translations are gone
- [ ] Block removing the last remaining language (error message shown)
- [ ] Delete a project after typing its exact name; project disappears and UI resets

Notes:
- Database schema uses `ON DELETE CASCADE` FKs, so deletes do not leave orphan rows.
- Language codes are accepted as provided (case not enforced at DB); UI treats them verbatim.

---

## 🔧 Technical Details

### Core Components

#### lib/supabase.ts
- Supabase client initialization
- TypeScript interfaces for database tables

#### lib/translations.ts
Database query functions:
- `getTranslationsGrid(projectId)`
- `updateTranslation(translationId, value)`
- `createTranslation(keyId, languageId, value)`
- `getProjects()`
- `getProjectLanguages(projectId)`
- `createProject(name, initialLanguages?)`
- `deleteProject(projectId)`
- `addLanguage(projectId, code, name?)`
- `deleteLanguage(projectId, code)`

#### lib/theme.ts
- Theme store with persistence and system preference fallback

#### components/TranslationGrid.tsx
Interactive grid component featuring:
- Keys as rows; languages as columns
- Click-to-edit inline editing
- Visual indicators for missing translations
- Save on Enter; cancel on Escape
- Pagination for large datasets

#### app/page.tsx
Main application page with:
- Project selector dropdown (Radix DropdownMenu)
- Filter SegmentedControl (All/Missing/Complete)
- Export menus (all languages and per-language JSON)
- Add New Key dialog
- Loading and empty states

### Data Flow
```
User clicks cell →
  Component enters edit mode →
  User types →
  User presses Enter →
  updateTranslation()/createTranslation() →
  Supabase updated →
  Local state updated →
  Grid re-renders
```

### Grid Performance
- TanStack Table handles efficient rendering
- Client-side pagination by default
- For very large projects, consider:
  - Virtual scrolling via `@tanstack/virtual`
  - Server-side pagination
  - Lazy loading

### Missing Translation Detection
- Cells with `null` or empty string values are highlighted
- Translation record may not exist (new key) or value may be empty

---

## 🚧 Not Yet Implemented

1. **AI-Assisted Key Creation**
   - Optional: integrate OpenAI for automatic translations on key creation
2. **Bulk Export Enhancements**
   - Optional ZIP download for all languages
3. **Data Import**
   - UI for importing JSON/MariaDB exports
4. **Authentication**
   - User login and project-level permissions

---

## 🛠️ Technologies

- Next.js 15 (App Router)
- TypeScript
- Supabase
- TanStack Table
- Tailwind CSS v4
- Radix UI

---

## 🐛 Troubleshooting

If you encounter issues:
1. Check Supabase connection: verify `.env.local`
2. Check browser console for errors
3. Check Supabase logs
4. Verify database schema
5. Check RLS policies (may disable for local testing)

---

## 🚀 Deploy on Vercel

The easiest way to deploy is using the Vercel Platform.
See Next.js deployment docs for details.

---

## 📊 Status

Current State: ✅ Foundation complete and ready for testing

What works:
- Translation grid with inline editing
- Project selection
- JSON export
- Missing translation indicators

What's next:
- Import/AI translation/auth enhancements

Last updated: 2025-10-10

---

## 📝 Changelog

- 2025-10-10: Fixed caret jumping to the start when typing/backspace in grid editor. The editor now uses a localized cell state and stable column renderers; Enter-to-save and blur-to-save are unchanged.
