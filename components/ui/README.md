## UI Primitives Guide

This folder contains small, accessible primitives styled with Tailwind CSS tokens from `app/globals.css`.

### Tokens
- Background: `bg-background`, `bg-surface`, `bg-surface-elevated`, `bg-surface-hover`
- Text: `text-foreground`, `text-muted`, `text-muted-foreground`
- Borders: `border-border`, `border-border-strong`
- State: `bg-primary`, `text-primary`, `bg-primary-soft`, `bg-success`, `bg-warning`, `bg-danger`, `bg-info`
- Focus: use `focus:ring-2` with `ring-primary` or component defaults

### Button
Props: `variant` (primary | secondary | outline | ghost | destructive), `size` (sm | md | lg)

```tsx
import { Button } from '@/components/ui/Button';

<Button>Save</Button>
<Button variant="outline" size="sm">Cancel</Button>
```

### DropdownMenu (Radix)
Wrap button in `DropdownMenuTrigger asChild`. Use `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuCheckboxItem`.

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">Open</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-56">
    <DropdownMenuLabel>Title</DropdownMenuLabel>
    <DropdownMenuItem onClick={action}>Do Thing</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Dialog (Radix)
```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Details</DialogDescription>
    </DialogHeader>
    ...
  </DialogContent>
</Dialog>
```

### Tooltip (Radix)
Use for icon-only actions; ensure `aria-label` on the trigger if needed.

### Skeleton
Rectangular placeholder used in loading states.

```tsx
<Skeleton className="h-8 w-24" />
```

### Spinner
Small inline loading indicator.

```tsx
import { Spinner } from '@/components/ui/Spinner';
<Spinner size={16} />
```

### SegmentedControl
Accessible radio-group-like control for small mutually-exclusive options.

```tsx
import { SegmentedControl } from '@/components/ui/SegmentedControl';

<SegmentedControl
  ariaLabel="Filter translations"
  value={mode}
  onValueChange={setMode}
  options={[
    { value: 'all', label: 'All' },
    { value: 'missing', label: 'Missing' },
    { value: 'complete', label: 'Complete' },
  ]}
/>
```

### Accessibility notes
- All interactive elements must be reachable via keyboard and have visible focus.
- Menus, dialogs, and tooltips rely on Radix for proper roles and keyboard handling.
- Announce success/error via an aria-live region (see `app/page.tsx`).


