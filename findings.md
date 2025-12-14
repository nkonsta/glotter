## Run-time findings

### Warnings

- Source map warnings like:
  - `Source Map ... has invalid sourcesContent`
  - These are non-blocking and can be ignored during local dev.

### Error (blocking)

- `Preflight response is not successful. Status code: 414` and `TypeError: Load failed` when fetching `translations`.
  - Root cause: `getTranslationsGrid` builds a very long GET request using an `in(...)` filter with hundreds of `key_id`s, which produces an excessively long URL. The browser’s CORS preflight fails with 414 (URI Too Long).

## Recommended fixes

1) Prefer PostgREST embedding (server-side join)
   - Query `translation_keys` with nested `translations`, filtered by `project_id`:
     - `.from('translation_keys').select('id,key,translations(id,project_language_id,value)').eq('project_id', projectId)`
   - This avoids sending a massive `in(...)` list; the server joins rows and returns a compact payload.
   - Requires FK `translations.key_id → translation_keys.id` (typical in Supabase schemas).

2) Fallback if embedding not available: chunked requests
   - Split the keys into batches (e.g., 200 IDs per request) and issue multiple smaller `.in('key_id', batch)` calls, then merge client-side.
   - Keeps each URL under limits while preserving current shape.

## Minor cleanups (non-blocking)

- `app/globals.css`: use `:root` instead of `::root`.
- Fonts in `app/layout.tsx`: current `Geist` import via `next/font/google` may be invalid. Either switch to `Inter`/`Roboto_Mono` or add the official Geist font package and adjust imports.
- `lib/supabase.ts`: add an env var guard to surface a friendly error if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, to avoid hard crashes.

## Next steps

- Implement embedding approach in `lib/translations.ts` for `getTranslationsGrid`, or use chunked fallback.
- Apply minor cleanups above.
- Re-run `npm run dev` and validate translations grid loads and edits persist.
- Track the Next.js security update from 2025-12-11 (CVE-2025-55183/55184/67779). We've bumped `next`/`eslint-config-next` to 15.5.9, the patched release called out in the advisory: https://nextjs.org/blog/security-update-2025-12-11.
- React and React DOM are already pinned to 19.1.0, which satisfies the Next.js 15.5.9 peer range. No newer compatible versions were identified locally (registry access is blocked), but reinstall dependencies to ensure `node_modules` picks up the 15.5.9 build artifacts.


