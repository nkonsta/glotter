# Translation Management System

A Next.js-based web application for managing multi-language translations, built to replace OneSky functionality. Features inline editing, real-time updates, and Supabase backend.

---

## 🎯 Features

### ✅ Translation Grid Interface
- **Grid View**: Translation keys as rows, languages as columns
- **Inline Editing**: Click any cell to edit, Enter to save, Escape to cancel
- **Missing Translation Indicators**: Empty cells highlighted in red
- **Real-time Updates**: Changes saved immediately to Supabase
- **Performance**: Optimized for 1000+ translation keys

### ✅ Project Management
- **Project Selector**: Dropdown to switch between projects
- **Auto-load**: First project loaded automatically
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

**How to get these:**
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

Navigate to [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
glotter/
├── app/
│   ├── page.tsx                    # Main application page
│   ├── layout.tsx                  # App layout
│   └── globals.css                 # Global styles
├── components/
│   └── TranslationGrid.tsx         # Grid component with inline editing
├── lib/
│   ├── supabase.ts                 # Supabase client configuration
│   └── translations.ts             # Database query functions
├── .env.local                      # Environment variables (create this)
├── package.json                    # Dependencies
└── README.md                       # This file
```

---

## 📖 Usage

### Viewing Translations

1. Select a project from the dropdown
2. View all translation keys and their values across languages
3. Missing translations are highlighted in red
4. See translation count and language count at the top

### Editing Translations

1. Click any cell to edit
2. Type your changes
3. Press **Enter** to save or **Escape** to cancel
4. Changes are immediately saved to Supabase
5. UI updates optimistically for instant feedback

### Adding New Keys

Click the "Add New Key" button (functionality coming soon with AI translation).

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
- [ ] Missing translations show red highlight
- [ ] Can switch between projects
- [ ] Performance is smooth with 1000+ keys

---

## 🔧 Technical Details

### Core Components

#### **lib/supabase.ts**
- Supabase client initialization
- TypeScript interfaces for database tables:
  - `Project`
  - `ProjectLanguage`
  - `TranslationKey`
  - `Translation`
  - `TranslationRow` (for grid view)

#### **lib/translations.ts**
Database query functions:
- `getTranslationsGrid(projectId)` - Fetch all translations in grid format
- `updateTranslation(translationId, value)` - Update existing translation
- `createTranslation(keyId, languageId, value)` - Create new translation
- `getProjects()` - Fetch all projects
- `getProjectLanguages(projectId)` - Fetch languages for a project

#### **components/TranslationGrid.tsx**
Interactive grid component featuring:
- Keys displayed as rows
- Languages displayed as columns
- Click-to-edit inline editing
- Visual indicators for missing translations (red highlight)
- Auto-save on Enter key
- Cancel on Escape key
- Optimistic UI updates
- Handles 1000+ keys efficiently with TanStack Table

#### **app/page.tsx**
Main application page with:
- Project selector dropdown
- Translation grid display
- Loading states
- Error handling with helpful setup messages
- Translation/language count display
- "Add New Key" button (placeholder)

### Data Flow
```
User clicks cell →
  Component enters edit mode →
  User types →
  User presses Enter →
  updateTranslation() or createTranslation() called →
  Supabase updated →
  Local state updated →
  Grid re-renders
```

### Grid Performance
- TanStack Table handles rendering optimization
- Currently loads all data at once
- For projects with 5000+ keys, consider implementing:
  - Virtual scrolling
  - Server-side pagination
  - Lazy loading

### Missing Translation Detection
- Cells with `null` or empty string values are highlighted red
- Translation record may not exist (new key) or value may be empty
- `createTranslation()` used for new records, `updateTranslation()` for existing

---

## 🚧 Not Yet Implemented

### Features Mentioned in PRD but Not Built Yet:

1. **Add New Translation Key**
   - Button exists but not functional
   - AI translation integration not implemented
   - Need to add OpenAI API integration

2. **Export Functionality**
   - No JSON export
   - No ZIP download for all languages
   - Export script exists but not integrated into UI

3. **Data Import**
   - No UI for importing MariaDB exports
   - Bulk import script exists but not integrated into UI

4. **Search/Filter**
   - No search functionality for translation keys
   - No filtering by language or missing translations

5. **Authentication**
   - No user login
   - No project permissions
   - Currently relies on Supabase RLS (if configured)

---

## 🎯 Next Steps (Priority Order)

### High Priority - MVP Completion

1. **Add New Key with AI Translation**
   - Create modal/form for adding new keys
   - Integrate OpenAI API for auto-translation
   - Add new key + translations to database
   - Refresh grid after adding

2. **Export Functionality**
   - Create API route to generate JSON per language
   - Add ZIP export for all languages
   - Reconstruct nested JSON from dot-notation keys
   - Download buttons in UI

3. **Import Functionality**
   - Create import UI (upload or paste JSON)
   - Parse MariaDB export format
   - Bulk insert into database
   - Show import progress/results

### Medium Priority - User Experience

4. **Search and Filter**
   - Add search box to filter keys
   - Filter by missing translations
   - Filter by language

5. **Performance Optimizations**
   - Add pagination or virtual scrolling for very large datasets
   - Debounce search input
   - Add loading indicators

### Low Priority - Polish

6. **Better Error Handling**
   - Toast notifications for save success/failure
   - Retry logic for failed saves
   - Validation for translation values

7. **UI Enhancements**
   - Keyboard navigation (arrow keys to move between cells)
   - Bulk edit mode
   - Copy/paste support

---

## 🛠️ Technologies

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Supabase** - Backend and database
- **TanStack Table** - Data grid component
- **Tailwind CSS** - Styling

---

## 🐛 Troubleshooting

If you encounter issues:

1. **Check Supabase connection**: Verify `.env.local` has correct credentials
2. **Check browser console**: Look for error messages
3. **Check Supabase logs**: Go to Supabase dashboard → Logs
4. **Verify database schema**: Ensure all tables exist with correct structure
5. **Check RLS policies**: May need to disable Row Level Security for testing

---

## 🚀 Deploy on Vercel

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 📊 Status

**Current State**: ✅ Foundation complete and ready for testing

**What works**:
- Translation grid with inline editing
- Project selection
- Real-time database updates
- Missing translation indicators

**What's needed to complete MVP**:
- Add New Key with AI translation
- Export functionality (JSON/ZIP)
- Import functionality (MariaDB/JSON)

**Estimated time to MVP completion**: 3-5 days

---

*Last updated: 2025-10-09*
