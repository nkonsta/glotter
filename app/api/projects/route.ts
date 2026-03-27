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

export async function POST(request: Request) {
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
  const supabase = getSupabaseAdminClient();

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

  return NextResponse.json(project, { status: 201 });
}
