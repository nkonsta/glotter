import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type CreateProjectPayload = {
  name: string;
  initialLanguages?: Array<{ code: string; name?: string }>;
};

function isCreateProjectPayload(payload: unknown): payload is CreateProjectPayload {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<Record<keyof CreateProjectPayload, unknown>>;
  return typeof candidate.name === 'string' && candidate.name.trim().length > 0;
}

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return unauthorized('Missing bearer token.');
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return unauthorized('Missing bearer token.');
  }

  const supabase = getSupabaseAdminClient();

  const { data: authUser, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authUser?.user) {
    return unauthorized('Invalid or expired session.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isCreateProjectPayload(body)) {
    return NextResponse.json({ error: 'Invalid payload: name is required' }, { status: 400 });
  }

  const { name, initialLanguages } = body;

  const { data: adminMatch, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', authUser.user.id)
    .maybeSingle();

  if (adminError) {
    return NextResponse.json({ error: 'Failed to verify admin access.' }, { status: 500 });
  }

  const isPlatformAdmin = Boolean(adminMatch);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({ name: name.trim() })
    .select('*')
    .single();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  const languagesToInsert =
    initialLanguages && initialLanguages.length > 0
      ? initialLanguages
      : [{ code: 'en', name: 'English' }];

  const insertRows = languagesToInsert.map((l) => ({
    project_id: project.id,
    language_code: (l.code || '').toLowerCase(),
    language_name: l.name ?? null,
    is_active: true,
  }));

  const { error: langError } = await supabase
    .from('project_languages')
    .upsert(insertRows, { onConflict: 'project_id,language_code' });

  if (langError) {
    return NextResponse.json({ error: langError.message }, { status: 500 });
  }

  if (!isPlatformAdmin) {
    const { error: memberError } = await supabase
      .from('project_members')
      .insert({
        project_id: project.id,
        user_id: authUser.user.id,
        role: 'owner',
        view_languages: null,
        edit_languages: null,
      });

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }
  }

  return NextResponse.json(project, { status: 201 });
}
