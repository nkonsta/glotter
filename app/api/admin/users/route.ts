import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type RequesterContext =
  | { requester: User; supabase: ReturnType<typeof getSupabaseAdminClient> }
  | { response: NextResponse };

type ProjectRecord = {
  id: string;
  name: string;
};

type MembershipRecord = {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'member';
  view_languages: string[] | null;
  edit_languages: string[] | null;
  created_at: string;
};

type LanguageRecord = {
  project_id: string;
  language_code: string;
  language_name: string | null;
};

const DATA_PAGE_SIZE = 1000;

async function collectPages<T>(
  loadPage: (from: number, to: number) => Promise<{ rows: T[]; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const page = await loadPage(from, from + DATA_PAGE_SIZE - 1);
    if (page.error) throw page.error;
    rows.push(...page.rows);
    if (page.rows.length < DATA_PAGE_SIZE) break;
    from += DATA_PAGE_SIZE;
  }

  return rows;
}

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

async function resolvePlatformAdmin(req: Request): Promise<RequesterContext> {
  const supabase = getSupabaseAdminClient();
  const authHeader = req.headers.get('authorization') ?? '';

  if (!authHeader.startsWith('Bearer ')) {
    return { response: unauthorized('Missing bearer token.') };
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return { response: unauthorized('Missing bearer token.') };
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    return { response: unauthorized('Invalid or expired session.') };
  }

  const { data: adminMatch, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (adminError) {
    return { response: NextResponse.json({ error: 'Failed to verify admin access.' }, { status: 500 }) };
  }

  if (!adminMatch) {
    return { response: unauthorized('Platform admin access required.', 403) };
  }

  return { requester: data.user, supabase };
}

export async function GET(req: Request) {
  const auth = await resolvePlatformAdmin(req);
  if ('response' in auth) return auth.response;

  const { supabase } = auth;

  // listUsers is paginated (default 50/page); fetch all pages
  const allUsers: User[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: listResult, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ error: 'Failed to list users.' }, { status: 500 });
    }
    const batch = listResult?.users ?? [];
    allUsers.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  let adminRows: Array<{ user_id: string }>;
  let projects: ProjectRecord[];
  let memberships: MembershipRecord[];
  let languages: LanguageRecord[];

  try {
    [adminRows, projects, memberships, languages] = await Promise.all([
      collectPages(async (from, to) => {
        const { data, error } = await supabase
          .from('platform_admins')
          .select('user_id')
          .order('created_at')
          .order('user_id')
          .range(from, to);
        return { rows: (data ?? []) as Array<{ user_id: string }>, error };
      }),
      collectPages(async (from, to) => {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .order('name')
          .order('id')
          .range(from, to);
        return { rows: (data ?? []) as ProjectRecord[], error };
      }),
      collectPages(async (from, to) => {
        const { data, error } = await supabase
          .from('project_members')
          .select('id, project_id, user_id, role, view_languages, edit_languages, created_at')
          .order('created_at')
          .order('id')
          .range(from, to);
        return { rows: (data ?? []) as MembershipRecord[], error };
      }),
      collectPages(async (from, to) => {
        const { data, error } = await supabase
          .from('project_languages')
          .select('project_id, language_code, language_name')
          .eq('is_active', true)
          .order('project_id')
          .order('language_code')
          .range(from, to);
        return { rows: (data ?? []) as LanguageRecord[], error };
      }),
    ]);
  } catch {
    return NextResponse.json({ error: 'Failed to load the access directory.' }, { status: 500 });
  }

  const adminIds = new Set(adminRows.map((row) => row.user_id));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const assignmentsByUser = new Map<string, MembershipRecord[]>();

  for (const membership of memberships) {
    const current = assignmentsByUser.get(membership.user_id) ?? [];
    current.push(membership);
    assignmentsByUser.set(membership.user_id, current);
  }

  const users = allUsers.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    displayName: (u.user_metadata?.display_name as string | undefined) ?? null,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    emailConfirmedAt: u.email_confirmed_at ?? null,
    isPlatformAdmin: adminIds.has(u.id),
    assignments: (assignmentsByUser.get(u.id) ?? [])
      .map((membership) => ({
        id: membership.id,
        projectId: membership.project_id,
        projectName: projectNames.get(membership.project_id) ?? 'Unknown project',
        role: membership.role,
        viewLanguages: membership.view_languages,
        editLanguages: membership.edit_languages,
        createdAt: membership.created_at,
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName)),
  }));

  const projectLanguages = new Map<string, LanguageRecord[]>();
  for (const language of languages) {
    const current = projectLanguages.get(language.project_id) ?? [];
    current.push(language);
    projectLanguages.set(language.project_id, current);
  }

  return NextResponse.json({
    users,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      languages: (projectLanguages.get(project.id) ?? []).map((language) => ({
        code: language.language_code,
        name: language.language_name,
      })),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await resolvePlatformAdmin(req);
  if ('response' in auth) return auth.response;

  const { supabase } = auth;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { email?: unknown }).email !== 'string' ||
    typeof (payload as { password?: unknown }).password !== 'string'
  ) {
    return NextResponse.json({ error: 'email and password are required.' }, { status: 400 });
  }

  const email = (payload as { email: string }).email.trim().toLowerCase();
  const password = (payload as { password: string }).password;
  const displayName =
    typeof (payload as { displayName?: unknown }).displayName === 'string'
      ? ((payload as { displayName: string }).displayName.trim() || null)
      : null;

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password must be non-empty.' }, { status: 400 });
  }

  if (password.length < 12) {
    return NextResponse.json({ error: 'Password must be at least 12 characters.' }, { status: 400 });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(displayName ? { user_metadata: { display_name: displayName } } : {}),
  });

  if (createError || !created?.user) {
    const message = createError?.message ?? 'Failed to create user.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    user: {
      id: created.user.id,
      email: created.user.email ?? null,
      displayName: (created.user.user_metadata?.display_name as string | undefined) ?? null,
      createdAt: created.user.created_at,
    },
  });
}

export async function PATCH(req: Request) {
  const auth = await resolvePlatformAdmin(req);
  if ('response' in auth) return auth.response;

  const { requester, supabase } = auth;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { userId?: unknown }).userId !== 'string' ||
    typeof (payload as { isPlatformAdmin?: unknown }).isPlatformAdmin !== 'boolean'
  ) {
    return NextResponse.json({ error: 'userId and isPlatformAdmin are required.' }, { status: 400 });
  }

  const userId = (payload as { userId: string }).userId.trim();
  const isPlatformAdmin = (payload as { isPlatformAdmin: boolean }).isPlatformAdmin;
  const removeProjectMemberships =
    (payload as { removeProjectMemberships?: unknown }).removeProjectMemberships === true;

  if (!userId) {
    return NextResponse.json({ error: 'userId must be non-empty.' }, { status: 400 });
  }

  if (!isPlatformAdmin && userId === requester.id) {
    return NextResponse.json(
      { error: 'You cannot revoke your own platform-admin access. Ask another admin to do it.' },
      { status: 400 }
    );
  }

  const { data: targetResponse, error: lookupError } = await supabase.auth.admin.getUserById(userId);
  if (lookupError) {
    return NextResponse.json({ error: 'Failed to look up user in Supabase Auth.' }, { status: 500 });
  }

  if (!targetResponse?.user) {
    return NextResponse.json({ error: 'The selected account no longer exists.' }, { status: 404 });
  }

  const { data: changed, error } = await supabase.rpc('set_platform_admin_access', {
    p_user_id: userId,
    p_enabled: isPlatformAdmin,
    p_remove_memberships: removeProjectMemberships,
  });

  if (error) {
    if (error.code === '23514') {
      return NextResponse.json(
        { error: 'Cannot revoke the final platform admin. Grant admin access to another user first.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Failed to update platform-admin access.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    changed: Boolean(changed),
    userId,
    isPlatformAdmin,
  });
}

export async function DELETE(req: Request) {
  const auth = await resolvePlatformAdmin(req);
  if ('response' in auth) return auth.response;

  const { requester, supabase } = auth;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { userId?: unknown }).userId !== 'string'
  ) {
    return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
  }

  const userId = (payload as { userId: string }).userId.trim();

  if (!userId) {
    return NextResponse.json({ error: 'userId must be non-empty.' }, { status: 400 });
  }

  const { data: targetAdmin, error: targetAdminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (targetAdminError) {
    return NextResponse.json({ error: 'Failed to verify platform admin status.' }, { status: 500 });
  }

  if (targetAdmin) {
    const { count: adminCount, error: adminCountError } = await supabase
      .from('platform_admins')
      .select('user_id', { count: 'exact', head: true });

    if (adminCountError || adminCount === null) {
      return NextResponse.json({ error: 'Failed to count platform admins.' }, { status: 500 });
    }

    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the final platform admin. Grant admin access to another user first.' },
        { status: 409 }
      );
    }
  }

  if (userId === requester.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  // Nullify FK references that have no ON DELETE CASCADE before deleting auth user
  const { error: translationsError } = await supabase
    .from('translations')
    .update({ updated_by: null })
    .eq('updated_by', userId);

  if (translationsError) {
    return NextResponse.json({ error: 'Failed to clean up translation references.' }, { status: 500 });
  }

  const { error: historyError } = await supabase
    .from('translation_history')
    .update({ updated_by: null })
    .eq('updated_by', userId);

  if (historyError) {
    return NextResponse.json({ error: 'Failed to clean up translation history references.' }, { status: 500 });
  }

  const { error: activityError } = await supabase
    .from('project_activity_log')
    .update({ user_id: null })
    .eq('user_id', userId);

  if (activityError) {
    return NextResponse.json({ error: 'Failed to clean up activity log references.' }, { status: 500 });
  }

  const { error: invitesError } = await supabase
    .from('project_invites')
    .update({ invited_by: null })
    .eq('invited_by', userId);

  if (invitesError) {
    return NextResponse.json({ error: 'Failed to clean up project invite references.' }, { status: 500 });
  }

  const { error: adminError } = await supabase
    .from('platform_admins')
    .delete()
    .eq('user_id', userId);

  if (adminError) {
    if (adminError.code === '23514') {
      return NextResponse.json(
        { error: 'Cannot delete the final platform admin. Grant admin access to another user first.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Failed to remove platform admin record.' }, { status: 500 });
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message ?? 'Failed to delete user.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
