import { NextResponse } from 'next/server';
import { generateApiKey, type ProjectApiKeyRecord } from '@/lib/apiKeys';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type OwnerContext =
  | { userId: string; supabase: ReturnType<typeof getSupabaseAdminClient> }
  | { response: NextResponse };

const MAX_ACTIVE_KEYS_PER_PROJECT = 20;
const MAX_NAME_LENGTH = 100;
const KEY_COLUMNS = 'id, project_id, name, key_prefix, created_at, last_used_at, revoked_at';

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function toApiKey(record: ProjectApiKeyRecord) {
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.key_prefix,
    createdAt: record.created_at,
    lastUsedAt: record.last_used_at,
    revokedAt: record.revoked_at,
  };
}

/** Only project owners and platform admins manage a project's API keys. */
async function resolveProjectOwner(req: Request, projectId: string | null): Promise<OwnerContext> {
  if (!projectId) {
    return { response: errorResponse('projectId is required.', 400) };
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!accessToken) {
    return { response: errorResponse('Missing bearer token.', 401) };
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    return { response: errorResponse('Invalid or expired session.', 401) };
  }

  const { data: adminMatch, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (adminError) {
    return { response: errorResponse('Failed to verify admin access.', 500) };
  }

  if (!adminMatch) {
    const { data: membership, error: membershipError } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (membershipError) {
      return { response: errorResponse('Failed to verify project permissions.', 500) };
    }

    if (!membership || membership.role !== 'owner') {
      return { response: errorResponse('Insufficient permissions.', 403) };
    }
  }

  return { userId: data.user.id, supabase };
}

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get('projectId');
  const auth = await resolveProjectOwner(req, projectId);
  if ('response' in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from('project_api_keys')
    .select(KEY_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    return errorResponse('Failed to load API keys.', 500);
  }

  return NextResponse.json({ keys: ((data ?? []) as ProjectApiKeyRecord[]).map(toApiKey) });
}

export async function POST(req: Request) {
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON payload.', 400);
  }

  const body = (payload ?? {}) as { projectId?: unknown; name?: unknown };
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : null;
  const auth = await resolveProjectOwner(req, projectId);
  if ('response' in auth) return auth.response;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) {
    return errorResponse(`name is required and must be at most ${MAX_NAME_LENGTH} characters.`, 400);
  }

  const { count, error: countError } = await auth.supabase
    .from('project_api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .is('revoked_at', null);

  if (countError) {
    return errorResponse('Failed to verify existing API keys.', 500);
  }

  if ((count ?? 0) >= MAX_ACTIVE_KEYS_PER_PROJECT) {
    return errorResponse(`A project can have at most ${MAX_ACTIVE_KEYS_PER_PROJECT} active API keys. Revoke one first.`, 409);
  }

  const { key, keyPrefix, keyHash } = generateApiKey();
  const { data, error } = await auth.supabase
    .from('project_api_keys')
    .insert({ project_id: projectId, name, key_prefix: keyPrefix, key_hash: keyHash, created_by: auth.userId })
    .select(KEY_COLUMNS)
    .single();

  if (error || !data) {
    return errorResponse('Failed to create API key.', 500);
  }

  // The plaintext key is returned only once; only its hash is stored.
  return NextResponse.json({ key: toApiKey(data as ProjectApiKeyRecord), secret: key }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const keyId = searchParams.get('keyId');
  const auth = await resolveProjectOwner(req, projectId);
  if ('response' in auth) return auth.response;

  if (!keyId) {
    return errorResponse('keyId is required.', 400);
  }

  const { data, error } = await auth.supabase
    .from('project_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('project_id', projectId)
    .is('revoked_at', null)
    .select(KEY_COLUMNS)
    .maybeSingle();

  if (error) {
    return errorResponse('Failed to revoke API key.', 500);
  }

  if (!data) {
    return errorResponse('API key not found or already revoked.', 404);
  }

  return NextResponse.json({ key: toApiKey(data as ProjectApiKeyRecord) });
}
