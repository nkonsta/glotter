### 🧠 Prompt: Modernize the Translations Table (2025 SaaS Look)

You are updating a Tailwind + Next.js UI spec.  
Your goal is to modernize the **translations table** so it feels premium and contemporary (like Linear, Vercel, or Notion dashboards).  
Do NOT change the app logic or accessibility. Only update styling, spacing, and interactions.

---

#### 🎨 Design Goals
- Light, airy, modern SaaS aesthetic
- Minimal visible borders (no full gridlines)
- Smooth hover & selection feedback
- Card-like row feel with subtle elevation
- Crisp typography hierarchy and spacing

---

#### 🔧 Implementation Instructions

**1. Table Container**
- Use: `rounded-xl overflow-hidden bg-white shadow-sm`
- Replace inner borders with: `divide-y divide-gray-100`
- Keep only a top border for the header row.

**2. Table Rows**
- Base: `hover:bg-gray-50 transition group`
- Hover effect: `group-hover:shadow-sm group-hover:ring-1 group-hover:ring-gray-200`
- Selection state:
  ```html
  tr[data-selected="true"] {
    background-color: theme('colors.blue.50');
    border-left: 3px solid theme('colors.blue.500');
  }
  ```
- Row height target: `h-14` to `h-16`

**3. Cells**
- Remove inner borders.
- Spacing: `py-3 px-4`
- Key column: `font-medium text-gray-900 tracking-tight`
- Value columns: `text-gray-700`
- Missing translation badge:
  ```html
  <span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-600">
    Missing
  </span>
  ```

**4. Hover & Row Actions**
- Add hidden icons that appear on hover:
  ```html
  <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
    <EditIcon class="w-4 h-4 text-gray-400 hover:text-gray-600" />
    <CopyIcon class="w-4 h-4 text-gray-400 hover:text-gray-600" />
  </div>
  ```
- Align them right inside the row.

**5. Typography & Spacing**
- Table header: `text-xs font-medium uppercase text-gray-500 tracking-wide`
- Body text: `text-sm text-gray-800`
- Secondary text (timestamps, notes): `text-xs text-gray-500`
- Use `tracking-tight` globally for modern feel.

**6. Subtle Motion**
- Add row fade-in: `opacity-0 animate-fade-in`
- Hover transitions: `transition-all duration-150 ease-out`
- Sticky header shadow: `shadow-[0_1px_2px_rgba(0,0,0,0.03)]`

**7. Keep the following unchanged**
- Sticky header and first column behavior
- Search, filters, and pagination layout
- Accessibility labels and keyboard navigation

---

✅ **Outcome**
The table should look clean, modern, and lightweight — no heavy borders, generous whitespace, refined typography, and smooth hover states that make it feel interactive and premium.