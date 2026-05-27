import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type BulkTranslationEntry = {
  key: string;
  langCode: string;
  value: string | null;
};

type BulkSavePayload = {
  projectId: string;
  entries: BulkTranslationEntry[];
  chunkSize?: number;
};

type MembershipRecord = {
  role?: string | null;
  edit_languages?: unknown;
};

function isBulkSavePayload(payload: unknown): payload is BulkSavePayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<Record<keyof BulkSavePayload, unknown>>;

  if (typeof candidate.projectId !== 'string' || !Array.isArray(candidate.entries)) {
    return false;
  }

  const hasValidChunkSize =
    candidate.chunkSize === undefined ||
    (typeof candidate.chunkSize === 'number' &&
      Number.isInteger(candidate.chunkSize) &&
      candidate.chunkSize > 0);

  if (!hasValidChunkSize) {
    return false;
  }

  return candidate.entries.every((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const item = entry as Partial<Record<keyof BulkTranslationEntry, unknown>>;
    return (
      typeof item.key === 'string' &&
      typeof item.langCode === 'string' &&
      (typeof item.value === 'string' || item.value === null)
    );
  });
}

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
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
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!isBulkSavePayload(payload)) {
    return NextResponse.json({ error: 'projectId and valid entries are required.' }, { status: 400 });
  }

  const projectId = payload.projectId.trim();
  if (!projectId) {
    return NextResponse.json({ error: 'projectId must be non-empty.' }, { status: 400 });
  }

  const entries = payload.entries
    .filter((entry) => entry.key && entry.langCode)
    .map((entry) => ({
      key: entry.key,
      langCode: entry.langCode.trim().toLowerCase(),
      value: entry.value,
    }))
    .filter((entry) => entry.langCode);

  if (entries.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const chunkSize = payload.chunkSize ?? 1000;

  const { data: adminMatch, error: adminError } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', authUser.user.id)
    .maybeSingle();

  if (adminError) {
    return NextResponse.json({ error: 'Failed to verify admin access.' }, { status: 500 });
  }

  const isPlatformAdmin = Boolean(adminMatch);
  let membership: MembershipRecord | null = null;

  if (!isPlatformAdmin) {
    const { data, error: membershipError } = await supabaseAdmin
      .from('project_members')
      .select('role, edit_languages')
      .eq('project_id', projectId)
      .eq('user_id', authUser.user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: 'Failed to verify project membership.' }, { status: 500 });
    }

    if (!data) {
      return unauthorized('Insufficient permissions.', 403);
    }

    membership = data as MembershipRecord;
  }

  const isOwner = isPlatformAdmin || membership?.role === 'owner';
  const editLanguages = Array.isArray(membership?.edit_languages)
    ? membership.edit_languages
        .map((code: unknown) => (typeof code === 'string' ? code.toLowerCase() : ''))
        .filter(Boolean)
    : [];

  const uniqueLanguageCodes = Array.from(new Set(entries.map((entry) => entry.langCode)));
  const languageIdByCode: Record<string, string> = {};

  for (const languageCodes of chunkArray(uniqueLanguageCodes, chunkSize)) {
    const { data, error } = await supabaseAdmin
      .from('project_languages')
      .select('id, language_code')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .in('language_code', languageCodes);

    if (error) {
      return NextResponse.json({ error: 'Failed to verify target languages.' }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{ id: string; language_code: string }>;
    rows.forEach((row) => {
      languageIdByCode[row.language_code.toLowerCase()] = row.id;
    });
  }

  const resolvedLanguageCodes = Object.keys(languageIdByCode);
  if (!isOwner && resolvedLanguageCodes.some((code) => !editLanguages.includes(code))) {
    return unauthorized('Insufficient permissions.', 403);
  }

  const uniqueKeys = Array.from(new Set(entries.map((entry) => entry.key)));
  let keyIdByKey: Record<string, string> = {};

  for (const keys of chunkArray(uniqueKeys, chunkSize)) {
    const { data, error } = await supabaseAdmin
      .from('translation_keys')
      .select('id, key')
      .eq('project_id', projectId)
      .in('key', keys);

    if (error) {
      return NextResponse.json({ error: 'Failed to verify translation keys.' }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{ id: string; key: string }>;
    rows.forEach((row) => {
      keyIdByKey[row.key] = row.id;
    });
  }

  const missingKeys = uniqueKeys.filter((key) => !keyIdByKey[key]);
  if (missingKeys.length > 0) {
    if (!isOwner) {
      return unauthorized('Only project owners can create translation keys.', 403);
    }

    for (const keys of chunkArray(missingKeys, chunkSize)) {
      const { error } = await supabaseAdmin
        .from('translation_keys')
        .upsert(
          keys.map((key) => ({ project_id: projectId, key })),
          { onConflict: 'project_id,key' }
        );

      if (error) {
        return NextResponse.json({ error: 'Failed to create translation keys.' }, { status: 500 });
      }
    }

    keyIdByKey = {};
    for (const keys of chunkArray(uniqueKeys, chunkSize)) {
      const { data, error } = await supabaseAdmin
        .from('translation_keys')
        .select('id, key')
        .eq('project_id', projectId)
        .in('key', keys);

      if (error) {
        return NextResponse.json({ error: 'Failed to reload translation keys.' }, { status: 500 });
      }

      const rows = (data ?? []) as Array<{ id: string; key: string }>;
      rows.forEach((row) => {
        keyIdByKey[row.key] = row.id;
      });
    }
  }

  const timestamp = new Date().toISOString();
  const rows = entries
    .filter((entry) => keyIdByKey[entry.key] && languageIdByCode[entry.langCode])
    .map((entry) => ({
      key_id: keyIdByKey[entry.key],
      project_language_id: languageIdByCode[entry.langCode],
      value: entry.value,
      updated_by: authUser.user.id,
      updated_at: timestamp,
    }));

  let total = 0;
  for (const chunk of chunkArray(rows, chunkSize)) {
    const { error } = await supabaseAdmin
      .from('translations')
      .upsert(chunk, { onConflict: 'key_id,project_language_id' });

    if (error) {
      return NextResponse.json({ error: error.message ?? 'Failed to save translations.' }, { status: 500 });
    }

    total += chunk.length;
  }

  return NextResponse.json({ count: total });
}
