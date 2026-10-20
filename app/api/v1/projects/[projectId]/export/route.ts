import { createHash } from 'node:crypto';
import { authenticateApiCaller, errorResponse, isValidProjectId, resolveProjectAccess } from '@/lib/apiAuth';
import { ExportFormat, NestedKeyCollisionError, serializeLanguageJson } from '@/lib/importExport';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';
import { fetchTranslationsGrid } from '@/lib/translationGrid';

type ExportType = 'json' | 'zip';

const EXPORT_FORMATS = new Set<ExportFormat>(['nested', 'flat']);
const EXPORT_TYPES = new Set<ExportType>(['json', 'zip']);

function parseLanguageList(value: string | null): string[] {
  if (!value) return [];
  const codes = value
    .split(',')
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(codes));
}

function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  return ifNoneMatch.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}

/**
 * Read-only translation export for CI jobs, build scripts, and apps.
 *
 * Auth: `Authorization: Bearer <project API key | Supabase session token>`.
 * Query: `languages=en,fr` (default: all visible), `format=nested|flat`,
 * `fallback=<code>`, `type=json|zip` (default: json for exactly one requested
 * language, otherwise zip). Responses carry an ETag; send it back in
 * `If-None-Match` to get `304 Not Modified` when nothing changed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isValidProjectId(projectId)) {
    return errorResponse('projectId must be a valid UUID.', 400);
  }

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get('format') ?? 'nested') as ExportFormat;
  if (!EXPORT_FORMATS.has(format)) {
    return errorResponse('format must be "nested" or "flat".', 400);
  }

  const typeParam = searchParams.get('type');
  if (typeParam !== null && !EXPORT_TYPES.has(typeParam as ExportType)) {
    return errorResponse('type must be "json" or "zip".', 400);
  }

  const requestedLanguages = parseLanguageList(searchParams.get('languages'));
  const fallbackLanguage = searchParams.get('fallback')?.trim().toLowerCase() || null;

  const supabase = getSupabaseAdminClient();
  const auth = await authenticateApiCaller(req, supabase);
  if ('response' in auth) return auth.response;
  const access = await resolveProjectAccess(supabase, auth.caller, projectId);
  if ('response' in access) return access.response;

  const { data: languageRows, error: languagesError } = await supabase
    .from('project_languages')
    .select('language_code')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('language_code');

  if (languagesError) {
    return errorResponse('Failed to load project languages.', 500);
  }

  const activeLanguages = ((languageRows ?? []) as Array<{ language_code: string }>).map((row) =>
    row.language_code.toLowerCase()
  );
  const activeSet = new Set(activeLanguages);
  const canView = (code: string) => access.viewLanguages === null || access.viewLanguages.has(code);

  const unknownLanguage = [...requestedLanguages, ...(fallbackLanguage ? [fallbackLanguage] : [])].find(
    (code) => !activeSet.has(code)
  );
  if (unknownLanguage) {
    return errorResponse(`Unknown or inactive language: ${unknownLanguage}.`, 404);
  }

  if (requestedLanguages.some((code) => !canView(code)) || (fallbackLanguage && !canView(fallbackLanguage))) {
    return errorResponse('Insufficient permissions for the requested languages.', 403);
  }

  const exportLanguages = requestedLanguages.length > 0 ? requestedLanguages : activeLanguages.filter(canView);
  if (exportLanguages.length === 0) {
    return errorResponse('No languages available to export.', 404);
  }

  const type: ExportType =
    (typeParam as ExportType | null) ?? (requestedLanguages.length === 1 ? 'json' : 'zip');
  if (type === 'json' && exportLanguages.length !== 1) {
    return errorResponse('type=json requires exactly one language; use type=zip for several.', 400);
  }

  let files: Array<[string, string]>;
  try {
    const fetchCodes = Array.from(new Set([...exportLanguages, ...(fallbackLanguage ? [fallbackLanguage] : [])]));
    const rows = await fetchTranslationsGrid(supabase, projectId, fetchCodes);
    files = exportLanguages.map((code) => [code, serializeLanguageJson(rows, code, format, fallbackLanguage)]);
  } catch (error) {
    if (error instanceof NestedKeyCollisionError) {
      return errorResponse(error.message, 422);
    }
    console.error('Failed to export translations', error);
    return errorResponse('Failed to load translations.', 500);
  }

  // Hash the serialized content, not the ZIP bytes, which embed timestamps.
  const etag = `"${createHash('sha256').update(JSON.stringify({ type, format, files })).digest('hex')}"`;
  const cacheHeaders = { ETag: etag, 'Cache-Control': 'private, no-cache' };

  if (matchesEtag(req.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  if (type === 'json') {
    const [code, json] = files[0];
    return new Response(json, {
      headers: {
        ...cacheHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${code}.json"`,
      },
    });
  }

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const [code, json] of files) {
    zip.file(`${code}.json`, json);
  }
  const archive = await zip.generateAsync({ type: 'uint8array' });

  return new Response(archive as Uint8Array<ArrayBuffer>, {
    headers: {
      ...cacheHeaders,
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="translations.zip"',
    },
  });
}
