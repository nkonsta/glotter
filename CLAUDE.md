# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glotter is a Next.js-based translation management system built to replace OneSky functionality. It provides a web interface for managing multi-language translations with inline editing, real-time updates, and a Supabase backend.

## Development Commands

### Running the Application
```bash
npm run dev          # Start development server with Turbopack
npm run build        # Build for production with Turbopack
npm start            # Start production server
npm run lint         # Run ESLint
```

### Environment Setup
Before running the app, copy `env.example` to `.env.local` and add your Supabase credentials:
```bash
cp env.example .env.local
```

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key

## Architecture

### Tech Stack
- **Next.js 15** with App Router and React Server Components
- **TypeScript** with strict mode enabled
- **Supabase** for backend and database (PostgreSQL)
- **TanStack Table** for data grid rendering and performance
- **Tailwind CSS 4** for styling

### Key Architecture Patterns

**Data Flow:**
```
User Action → Component State → Supabase API → Database → Optimistic UI Update
```

**Translation Grid Pattern:**
The core of the app is a grid where:
- Translation keys are displayed as rows
- Languages are displayed as columns
- Each cell is editable inline (click → edit → Enter to save, Escape to cancel)
- Missing translations are highlighted in red
- Changes are immediately saved to Supabase with optimistic UI updates

**Database Query Strategy:**
- Uses a single embedded query to fetch translation keys with their translations (lib/translations.ts:19-24)
- Parallel fetching of languages and translations for performance (app/page.tsx:86-89)
- Data is transformed client-side into a grid structure (TranslationRow type)

### Important Code Locations

**Core Data Layer (lib/):**
- `lib/supabase.ts` - Supabase client initialization and TypeScript type definitions for database schema
- `lib/translations.ts` - All database query functions (getTranslationsGrid, updateTranslation, createTranslation, getProjects, getProjectLanguages)

**Main Components:**
- `app/page.tsx` - Main application page with project selector, search/filter UI, and state management
- `components/TranslationGrid.tsx` - Interactive grid component with inline editing, pagination, and TanStack Table integration

### Database Schema

The app expects these Supabase tables:

1. **projects** - Project definitions (id, name)
2. **project_languages** - Languages per project (id, project_id, language_code, language_name, is_active)
3. **translation_keys** - Translation keys per project (id, project_id, key)
4. **translations** - Actual translation values (id, key_id, project_language_id, value)

See README.md lines 116-159 for full schema SQL.

### State Management

**app/page.tsx manages:**
- Selected project
- All translations data (fetched once, filtered client-side)
- Search query and filter mode (all/missing/complete)
- Filtered translations derived from main data + filters

**components/TranslationGrid.tsx manages:**
- Table data (synced with parent via useEffect)
- Editing cell state (which cell is being edited)
- Edit value (current value being typed)
- Pagination state (current page, page size)

### Performance Considerations

- Pagination is implemented with default 50 items per page (adjustable to 25/50/100/200)
- Search and filtering happen client-side (full dataset is fetched once)
- For projects with 5000+ keys, consider implementing server-side pagination or virtual scrolling
- TanStack Table handles rendering optimization

### Translation Editing Workflow

1. User clicks a cell → Component enters edit mode with current value
2. User types changes in textarea
3. User presses Enter → `handleSave()` is called
4. Check if translation exists:
   - If `translation_id` exists → call `updateTranslation()`
   - If no `translation_id` → call `createTranslation()`
5. Update local state optimistically
6. Grid re-renders with new value

### Implemented Features

✅ Translation grid with inline editing
✅ Project selection dropdown
✅ Search functionality (searches both keys and values)
✅ Filter modes (all/missing/complete translations)
✅ Pagination with configurable page size
✅ Real-time database updates via Supabase
✅ Missing translation indicators (red highlight)
✅ Type-safe database queries

### Not Yet Implemented

The following features are mentioned in the PRD but not yet built:

- **Add New Translation Key** - Button exists but not functional (needs AI translation integration with OpenAI)
- **Export Functionality** - No JSON export or ZIP download for languages
- **Data Import** - No UI for importing existing translation data
- **Authentication** - No user login or project permissions (relies on Supabase RLS if configured)

When implementing new features, prioritize completing these MVP features before adding new functionality.

## Common Development Patterns

### Adding a New Database Query

1. Add TypeScript types to `lib/supabase.ts` if needed
2. Create query function in `lib/translations.ts`
3. Use async/await with try/catch in components
4. Handle errors gracefully with user-friendly messages

### Creating New UI Components

- Use TypeScript with explicit prop types
- Follow existing Tailwind CSS styling patterns (gradient backgrounds, rounded corners, shadow effects)
- Use 'use client' directive for interactive components
- Implement loading and error states

### Modifying the Translation Grid

The grid uses TanStack Table with memoized columns. When adding features:
- Update column definitions in useMemo to prevent unnecessary re-renders
- Maintain the actualRowIndex calculation for pagination (startIndex + displayRowIndex)
- Keep optimistic updates for immediate user feedback

## TypeScript Configuration

- Path alias `@/*` maps to project root
- Strict mode enabled
- Target ES2017
- Module resolution: bundler (Next.js specific)
