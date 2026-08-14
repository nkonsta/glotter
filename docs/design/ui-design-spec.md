# Glotter — Design System & Translations Dashboard Spec (Next.js + Tailwind)

> **Purpose:** A reusable design system and page-level implementation guide so an AI/dev can implement the Translations Dashboard exactly as intended.

---

## 1. Overview & Goals

- **Primary goal:** Turn the existing translations table into a polished, accessible, and reusable UI built with Next.js + Tailwind.
- **Secondary goal:** Provide a lightweight design system (tokens + components) that is easy to reuse across the app.
- **Success metrics:** Improved readability, clear hierarchy, faster scanning of missing translations, and consistent component usage.

---

## 2. Design Principles

1. **Clarity first:** Visual contrast and spacing should make content scannable.
2. **Progressive disclosure:** Show only what’s necessary; advanced actions appear on hover/selection.
3. **Atomic & reusable:** Components are small, composable, and configurable.
4. **Accessible by default:** High contrast, keyboard navigable, screen reader labels.

---

## 3. Tokens (Tailwind-first approach)

Add or extend Tailwind config with the following tokens.

```js
// tailwind.config.js (excerpt)
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#2B6CB0', // used for primary CTA and subtle accents
        primary-600: '#2C5282',
        accent: '#7C3AED', // optional second accent for states
        surface: '#F8FAFC',
        muted: '#64748B',
        'row-alt': '#F1F5F9',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      borderRadius: {
        xl: '1rem',
      },
      boxShadow: {
        card: '0 4px 18px rgba(16,24,40,0.06)',
      }
    }
  }
}
```

**Typography:**

- Base: `text-sm` (14px) body
- Headline: `text-2xl` (20–22px) in header
- Table header: `text-xs` (12px), uppercase tracking
- Use `font-medium` for labels and `font-normal` for content

**Spacing:** adopt 4pt grid with multiples: `px-2/4/6/8/12` etc.

---

## 4. Layout & Page Structure

High-level layout (desktop):

```
Topbar (sticky) — contains logo, project dropdown, actions
Main content: Card container with search/filters + translations table
Right or left optional collapsed sidebar with project metadata (mobile: toggleable)
Footer: pagination + counts
```

### Container rules

- Page horizontal padding: `px-6` (desktop), `px-4` (tablet), `px-2` (mobile)
- Content max-width: `max-w-6xl` (or `1200px`) centered
- Card background: `bg-white`, `shadow-card`, `rounded-xl`, `p-6`

---

## 5. Components

Each component is described with its responsibilities, props, and the recommended Tailwind implementation.

### 5.1 Topbar (Header)

- **Purpose:** Brand, project selector, global actions.
- **Props:** `projectName`, `onProjectChange`
- **Accessibility:** project select labelled, keyboard navigable

Tailwind utilities: `class="bg-white border-b h-16 flex items-center justify-between px-6"`

### 5.2 Search + Filters Bar

- **Elements:** Search input, language chips, status filter (All/Missing/Complete), Add Key button
- **Search:** `input[type=search]` with `aria-label="Search translations"`
- **Language chips:** small toggles showing counts: `inline-flex items-center gap-2 px-3 py-1 rounded-full border`
- **CTA:** `Add New Key` button (`bg-primary text-white px-4 py-2 rounded-lg shadow-sm hover:bg-primary-600`)

Example HTML (Tailwind):

```html
<div class="flex items-center gap-4">
  <div class="flex-1">
    <input aria-label="Search translations" type="search" placeholder="Search translation keys or values..." class="w-full rounded-lg border px-4 py-2 text-sm" />
  </div>
  <div class="flex gap-2 items-center">
    <button class="px-3 py-1 rounded-md border text-sm">All</button>
    <button class="px-3 py-1 rounded-md border text-sm">Missing</button>
    <button class="px-3 py-1 rounded-md border text-sm">Complete</button>
    <button class="ml-2 bg-primary text-white px-4 py-2 rounded-md">+ Add New Key</button>
  </div>
</div>
```

### 5.3 Table — Core Component

**Responsibilities:** Display keys (left), languages (columns), status per row. Support keyboard navigation, column visibility, and column freeze for Key.

**Accessibility:** table with `role="table"`, `aria-rowcount`, `aria-colcount`. Each row has `tabindex="0"` for keyboard focus.

**Key features to implement:**

- Sticky header (use `sticky top-0 z-20` on the header row inside scrolling container)
- Sticky first column (Key) for horizontal scroll using `sticky left-0 z-10 bg-white` plus a hairline shadow.
- Zebra striping: `even:bg-row-alt` and `hover:bg-surface` with smooth transition.
- Row hover: `transition-colors duration-150`.
- Inline edit affordance: show an edit icon (`svg`) on cell hover.

**Suggested classes for cells:**

- Header: `px-4 py-3 text-xs font-medium uppercase text-muted tracking-wide border-b`
- Cell: `px-4 py-4 text-sm text-gray-800 border-b whitespace-normal` (wrap long text)

**Missing translation indicator:** Display a subtle badge in the language cell if missing.

Badge examples:

- `span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-yellow-50 text-warning"` for missing
- `span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-50 text-success"` for present

**Performance tip:** Virtualize the table (react-window or tanstack virtual) if rows > 500.

### 5.4 Row Actions / Selection

- Select row using checkbox at left of Key column (for bulk actions).
- On row hover, reveal quick actions: edit, copy key, open history.
- Bulk toolbar appears when any row selected.

### 5.5 Pagination

- Items per page select (`10 | 25 | 50`) and numbered pagination.
- Place summary left: `Showing 1 to 25 of 776 keys` and pagination controls right.

### 5.6 Sidebar (optional)

- Shows project metadata, language config, quick import/export, help link.
- Collapsible on mobile.

---

## 6. Interactivity & Motion

Use CSS transitions and the `framer-motion` library for JS-based microinteractions where needed.

**Motion rules:**

- Hover transitions: `transition-colors duration-150 ease-in-out`
- Fade-in for rows: `opacity` animation on mount (100–150ms)
- Dropdowns and modals: scale + fade (150ms)
- Avoid lengthy animations—keep < 200ms for hover and < 300ms for modals

---

## 7. Accessibility

- Ensure color contrast >= 4.5:1 for body text. Use `text-gray-800` on white backgrounds.
- Inputs and buttons must have `aria-label` and focus states (`ring-2 ring-offset-2 ring-primary-300` via Tailwind)
- Table keyboard navigation: `tabindex` on each row and arrow key support optional
- Provide `sr-only` labels for icons and interactive controls
- For missing translations, provide a hidden message for screen readers (e.g. `aria-live` when filters update)

---

## 8. Responsive rules

**Desktop (≥ 1024px)**

- Full multi-column table
- Sidebar visible by default (collapsible)

**Tablet (640px–1024px)**

- Keep table, but allow horizontal scrolling within container.
- Consider collapsing less-used language columns into a dropdown per row.

**Mobile (< 640px)**

- Use a stacked list view: each key expands to show translations per language (accordion). Do NOT show full multi-column table on mobile.
- Search and filters should be condensed into a top `Filters` panel that can expand.

---

## 9. Implementation Notes & Code Guidelines

- Use functional React components with TypeScript.
- Data props example:

```ts
type TranslationRow = {
  key: string;
  translations: Record<string, string | null>; // languageCode => value or null
  updatedAt?: string;
}
```

- Use a `Table` wrapper that accepts columns and row renderer.
- Keep visuals and behavior configurable via props (e.g., `showStatusBadges`, `columnsVisible`).

**Example: KeyColumn component**

```tsx
function KeyColumn({ row, selected, onSelect }){
  return (
    <div className="sticky left-0 z-10 bg-white border-r">
      <div className="flex items-center gap-3 px-4 py-4">
        <input type="checkbox" checked={selected} onChange={() => onSelect(row.key)} aria-label={`Select ${row.key}`} />
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-900">{row.key}</div>
          <div className="text-xs text-gray-500">{row.updatedAt}</div>
        </div>
      </div>
    </div>
  )
}
```

**Virtualization:** if implementing virtualization, ensure sticky column support is handled (virtualization + sticky requires column anchoring or alternate approach: keep sticky column outside the virtualized scroll area).

---

## 10. Acceptance Criteria (PR checklist)

-

---

## 11. Example Tailwind Class Map (quick reference)

- Card container: `bg-white shadow-card rounded-xl p-6`
- Sticky header: `sticky top-0 bg-white z-20 border-b`
- Key first column: `sticky left-0 bg-white z-10 border-r`
- Row: `even:bg-row-alt hover:bg-surface transition-colors duration-150`
- Edit icon: `opacity-0 group-hover:opacity-100 transition-opacity`
- Badge (missing): `inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-yellow-50 text-warning`

---

## 12. Assets & Icons

- Use Heroicons or Lucide for UI icons.
- Provide SVG icons for: edit, copy, history, download, upload, filter, search.
- Use inline SVG (React components) to allow stroke color changes via Tailwind classes.

---

## 13. Testing & QA

- Test keyboard-only flows: searching, selecting rows, opening edit modal.
- Test with a screen reader (VoiceOver or NVDA) to ensure table semantics are clear.
- Test in low-bandwidth for large data sets.

---

## 14. Recommended Implementation Plan (sprints)

1. Setup tokens & tailwind config (+ fonts)
2. Implement topbar + search bar + quick filters
3. Implement table skeleton with sticky header & first column (static data)
4. Add badges, hover actions, and accessibility attributes
5. Add pagination and server-side data fetching
6. Mobile stacked layout and responsive polish
7. Performance improvements (virtualization) and QA

---

## 15. Appendix — Code Patterns

**Show/hide language columns pattern:** keep `columns` state that toggles class `hidden` for a give
