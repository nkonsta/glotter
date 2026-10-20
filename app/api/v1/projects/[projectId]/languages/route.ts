import { NextResponse } from 'next/server';
import { authenticateApiCaller, errorResponse, isValidProjectId, resolveProjectAccess } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type LanguageRecord = { language_code: string; language_name: string | null };

/**
 * List the project's active languages the caller can read, as
 * `{ languages: [{ code, name }] }`. Codes are the values accepted by the
 * export endpoint's `languages` and `fallback` parameters.
 */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isValidProjectId(projectId)) {
    return errorResponse('projectId must be a valid UUID.', 400);
  }

  const supabase = getSupabaseAdminClient();
  const auth = await authenticateApiCaller(req, supabase);
  if ('response' in auth) return auth.response;
  const access = await resolveProjectAccess(supabase, auth.caller, projectId);
  if ('response' in access) return access.response;

  // Platform admins pass the access check for any id, so confirm the project exists.
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) {
    return errorResponse('Failed to load project.', 500);
  }

  if (!project) {
    return errorResponse('Project not found.', 404);
  }

  const { data, error } = await supabase
    .from('project_languages')
    .select('language_code, language_name')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('language_code');

  if (error) {
    return errorResponse('Failed to load project languages.', 500);
  }

  const languages = ((data ?? []) as LanguageRecord[])
    .map((row) => ({ code: row.language_code.toLowerCase(), name: row.language_name }))
    .filter(({ code }) => access.viewLanguages === null || access.viewLanguages.has(code));

  return NextResponse.json({ languages });
}
