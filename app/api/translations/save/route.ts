import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type SaveTranslationPayload = {
  projectId: string;
  keyId: string;
  projectLanguageId: string;
  languageCode?: string | null;
  translationId?: string | null;
  value: string;
};

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';

  if (!authHeader.startsWith('Bearer ')) {
    return unauthorized('Missing bearer token.');
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return unauthorized('Missing bearer token.');
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !authUser?.user) {
    return unauthorized('Invalid or expired session.');
  }

  let payload: unknown = null;
  try {
    payload = (await req.json()) as SaveTranslationPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.projectId !== 'string' ||
    typeof payload.keyId !== 'string' ||
    typeof payload.projectLanguageId !== 'string' ||
    typeof payload.value !== 'string'
  ) {
    return NextResponse.json({ error: 'projectId, keyId, projectLanguageId, and value are required.' }, { status: 400 });
  }

  const projectId = payload.projectId.trim();
  const keyId = payload.keyId.trim();
  const projectLanguageId = payload.projectLanguageId.trim();
  const translationId = typeof payload.translationId === 'string' && payload.translationId ? payload.translationId.trim() : null;
  const requestedLanguageCode = typeof payload.languageCode === 'string' ? payload.languageCode.trim().toLowerCase() : null;
  const value = payload.value;

  if (!projectId || !keyId || !projectLanguageId) {
    return NextResponse.json({ error: 'projectId, keyId, and projectLanguageId must be non-empty.' }, { status: 400 });
  }

  const { data: adminMatch, error: adminError } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', authUser.user.id)
    .maybeSingle();

  if (adminError) {
    return NextResponse.json({ error: 'Failed to verify admin access.' }, { status: 500 });
  }

  const isPlatformAdmin = Boolean(adminMatch);

  const { data: languageRecord, error: languageError } = await supabaseAdmin
    .from('project_languages')
    .select('project_id, language_code')
    .eq('id', projectLanguageId)
    .maybeSingle();

  if (languageError) {
    return NextResponse.json({ error: 'Failed to verify target language.' }, { status: 500 });
  }

  if (!languageRecord) {
    return NextResponse.json({ error: 'Target language not found.' }, { status: 404 });
  }

  if (languageRecord.project_id !== projectId) {
    return NextResponse.json({ error: 'Language does not belong to the specified project.' }, { status: 400 });
  }

  const normalizedLanguageCode = (languageRecord.language_code ?? '').toLowerCase();

  if (requestedLanguageCode && requestedLanguageCode !== normalizedLanguageCode) {
    return NextResponse.json({ error: 'Language mismatch for translation request.' }, { status: 400 });
  }

  const { data: keyRecord, error: keyError } = await supabaseAdmin
    .from('translation_keys')
    .select('project_id')
    .eq('id', keyId)
    .maybeSingle();

  if (keyError) {
    return NextResponse.json({ error: 'Failed to verify translation key.' }, { status: 500 });
  }

  if (!keyRecord || keyRecord.project_id !== projectId) {
    return NextResponse.json({ error: 'Translation key does not belong to the specified project.' }, { status: 400 });
  }

  if (!isPlatformAdmin) {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('project_members')
      .select('role, edit_languages')
      .eq('project_id', projectId)
      .eq('user_id', authUser.user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: 'Failed to verify project membership.' }, { status: 500 });
    }

    if (!membership) {
      return unauthorized('Insufficient permissions.', 403);
    }

    if (membership.role !== 'owner') {
      const editLanguages = Array.isArray(membership.edit_languages)
        ? membership.edit_languages.map((code: unknown) => (typeof code === 'string' ? code.toLowerCase() : '')).filter(Boolean)
        : [];

      if (!editLanguages.includes(normalizedLanguageCode)) {
        return unauthorized('Insufficient permissions.', 403);
      }
    }
  }

  const timestamp = new Date().toISOString();
  const upsertPayload: Record<string, unknown> = {
    key_id: keyId,
    project_language_id: projectLanguageId,
    value,
    updated_by: authUser.user.id,
    updated_at: timestamp,
  };

  if (translationId) {
    upsertPayload.id = translationId;
  }

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from('translations')
    .upsert(upsertPayload, { onConflict: 'key_id,project_language_id' })
    .select('id')
    .single();

  if (upsertError || !upserted) {
    return NextResponse.json({ error: upsertError?.message ?? 'Failed to save translation.' }, { status: 500 });
  }

  return NextResponse.json({ translationId: upserted.id });
}
