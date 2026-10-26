import { NextResponse } from 'next/server';
import { authenticateApiCaller, errorResponse } from '@/lib/apiAuth';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type ProjectRecord = { id: string; name: string };

/**
 * List the projects the caller can read, as `{ projects: [{ id, name }] }`.
 * A project API key sees only its own project; platform admins see every
 * project; other users see the projects they are members of.
 */
export async function GET(req: Request) {
  const supabase = getSupabaseAdminClient();
  const auth = await authenticateApiCaller(req, supabase);
  if ('response' in auth) return auth.response;
  const { caller } = auth;

  let query = supabase.from('projects').select('id, name').order('name');

  if (caller.kind === 'apiKey') {
    query = query.eq('id', caller.projectId);
  } else if (!caller.isPlatformAdmin) {
    const { data: memberships, error: membershipsError } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', caller.userId);

    if (membershipsError) {
      return errorResponse('Failed to load project memberships.', 500);
    }

    const projectIds = ((memberships ?? []) as Array<{ project_id: string }>).map((row) => row.project_id);
    if (projectIds.length === 0) {
      return NextResponse.json({ projects: [] });
    }
    query = query.in('id', projectIds);
  }

  const { data, error } = await query;
  if (error) {
    return errorResponse('Failed to load projects.', 500);
  }

  const projects = ((data ?? []) as ProjectRecord[]).map(({ id, name }) => ({ id, name }));
  return NextResponse.json({ projects });
}
