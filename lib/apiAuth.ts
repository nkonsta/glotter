import { NextResponse } from 'next/server';
import { hashApiKey, isProjectApiKey } from '@/lib/apiKeys';
import type { getSupabaseAdminClient } from '@/lib/serverSupabase';

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;

/** Who is calling the public `/api/v1` API. */
export type ApiCaller =
  | { kind: 'apiKey'; projectId: string }
  | { kind: 'user'; userId: string; isPlatformAdmin: boolean };

/** `viewLanguages: null` means every active language in the project. */
export type ProjectAccess = { viewLanguages: Set<string> | null };

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reject malformed ids before they reach Postgres, which errors on invalid UUIDs. */
export function isValidProjectId(projectId: string): boolean {
  return UUID_PATTERN.test(projectId);
}

export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Authenticate `Authorization: Bearer <project API key | Supabase session token>`.
 * Project API keys are scoped to one project; session users keep their normal
 * platform-admin or membership access.
 */
export async function authenticateApiCaller(
  req: Request,
  supabase: AdminClient
): Promise<{ caller: ApiCaller } | { response: NextResponse }> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { response: errorResponse('Missing bearer token.', 401) };
  }

  if (isProjectApiKey(token)) {
    const { data, error } = await supabase
      .from('project_api_keys')
      .select('id, project_id, last_used_at, revoked_at')
      .eq('key_hash', hashApiKey(token))
      .maybeSingle();

    if (error) {
      return { response: errorResponse('Failed to verify API key.', 500) };
    }

    const record = data as { id: string; project_id: string; last_used_at: string | null; revoked_at: string | null } | null;
    if (!record || record.revoked_at) {
      return { response: errorResponse('Invalid or revoked API key.', 401) };
    }

    // Throttle writes so frequent polling does not update the row on every request.
    const lastUsed = record.last_used_at ? Date.parse(record.last_used_at) : 0;
    if (Date.now() - lastUsed > LAST_USED_WRITE_INTERVAL_MS) {
      const { error: touchError } = await supabase
        .from('project_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', record.id);
      if (touchError) {
        console.error('Failed to record API key usage', touchError);
      }
    }

    return { caller: { kind: 'apiKey', projectId: record.project_id } };
  }

  const { data: authUser, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser?.user) {
    return { response: errorResponse('Invalid or expired session.', 401) };
  }

  const { data: adminMatch, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', authUser.user.id)
    .maybeSingle();

  if (adminError) {
    return { response: errorResponse('Failed to verify admin access.', 500) };
  }

  return { caller: { kind: 'user', userId: authUser.user.id, isPlatformAdmin: Boolean(adminMatch) } };
}

/** Resolve which languages of `projectId` the caller may read. */
export async function resolveProjectAccess(
  supabase: AdminClient,
  caller: ApiCaller,
  projectId: string
): Promise<ProjectAccess | { response: NextResponse }> {
  if (caller.kind === 'apiKey') {
    return caller.projectId === projectId
      ? { viewLanguages: null }
      : { response: errorResponse('API key is not valid for this project.', 403) };
  }

  if (caller.isPlatformAdmin) {
    return { viewLanguages: null };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('project_members')
    .select('role, view_languages')
    .eq('project_id', projectId)
    .eq('user_id', caller.userId)
    .maybeSingle();

  if (membershipError) {
    return { response: errorResponse('Failed to verify project membership.', 500) };
  }

  if (!membership) {
    return { response: errorResponse('Insufficient permissions.', 403) };
  }

  if (membership.role === 'owner') {
    return { viewLanguages: null };
  }

  const viewLanguages = Array.isArray(membership.view_languages)
    ? membership.view_languages
        .map((code: unknown) => (typeof code === 'string' ? code.toLowerCase() : ''))
        .filter(Boolean)
    : [];
  return { viewLanguages: new Set(viewLanguages) };
}
