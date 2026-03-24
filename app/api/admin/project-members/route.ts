import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type RequesterContext =
  | { requester: User; supabase: ReturnType<typeof getSupabaseAdminClient>; isPlatformAdmin: boolean }
  | { response: NextResponse };

const ALLOWED_ROLES = ['owner', 'member'] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];
const ALLOWED_ROLE_SET = new Set<AllowedRole>(ALLOWED_ROLES);

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

function arraysEqual(a: string[] | null | undefined, b: string[] | null | undefined) {
  const isArrayA = Array.isArray(a);
  const isArrayB = Array.isArray(b);
  if (!isArrayA && !isArrayB) {
    return true;
  }
  if (!isArrayA || !isArrayB) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

async function resolveRequester(req: Request): Promise<RequesterContext> {
  const supabase = getSupabaseAdminClient();
  const authHeader = req.headers.get('authorization') ?? '';

  if (!authHeader?.startsWith('Bearer ')) {
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

  const isPlatformAdmin = Boolean(adminMatch);

  return { requester: data.user, supabase, isPlatformAdmin };
}

export async function GET(req: Request) {
  const auth = await resolveRequester(req);
  if ('response' in auth) return auth.response;

  const { supabase, requester, isPlatformAdmin } = auth;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId query parameter is required.' }, { status: 400 });
  }

  if (!isPlatformAdmin) {
    const { data: membership, error: membershipError } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', requester.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: 'Failed to verify project permissions.' }, { status: 500 });
    }

    if (!membership || membership.role !== 'owner') {
      return unauthorized('Insufficient permissions.', 403);
    }
  }

  const { data: members, error } = await supabase
    .from('project_members')
    .select('id, user_id, role, view_languages, edit_languages, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to load project members.' }, { status: 500 });
  }

  const membersWithUser = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data: userResponse } = await supabase.auth.admin.getUserById(member.user_id);
      const user = userResponse?.user ?? null;

      return {
        id: member.id,
        userId: member.user_id,
        role: member.role,
        viewLanguages: member.view_languages ?? null,
        editLanguages: member.edit_languages ?? null,
        email: user?.email ?? null,
        createdAt: member.created_at,
        lastSignInAt: user?.last_sign_in_at ?? null,
        emailConfirmedAt: user?.email_confirmed_at ?? null,
      };
    })
  );

  return NextResponse.json({ members: membersWithUser });
}

export async function POST(req: Request) {
  const auth = await resolveRequester(req);
  if ('response' in auth) return auth.response;

  const { supabase, requester, isPlatformAdmin } = auth;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { projectId?: unknown }).projectId !== 'string' ||
    typeof (payload as { email?: unknown }).email !== 'string' ||
    typeof (payload as { role?: unknown }).role !== 'string'
  ) {
    return NextResponse.json({ error: 'projectId, email, and role are required.' }, { status: 400 });
  }

  const projectId = (payload as { projectId: string }).projectId.trim();
  const email = (payload as { email: string }).email.trim().toLowerCase();
  const roleValue = (payload as { role: string }).role.trim().toLowerCase();

  if (!projectId || !email || !roleValue) {
    return NextResponse.json({ error: 'projectId, email, and role must be non-empty.' }, { status: 400 });
  }

  if (!ALLOWED_ROLE_SET.has(roleValue as AllowedRole)) {
    return NextResponse.json({ error: 'Role must be either "owner" or "member".' }, { status: 400 });
  }

  const role = roleValue as AllowedRole;

  const normalizeLanguageArray = (value: unknown): string[] | null => {
    if (!Array.isArray(value)) {
      return null;
    }
    const normalized = value
      .map((code) => (typeof code === 'string' ? code.trim().toLowerCase() : ''))
      .filter(Boolean);
    if (normalized.length === 0) {
      return [];
    }
    const unique = Array.from(new Set(normalized));
    unique.sort();
    return unique;
  };

  let viewLanguages: string[] | null = null;
  let editLanguages: string[] | null = null;

  if (role === 'member') {
    const normalizedView = normalizeLanguageArray((payload as { viewLanguages?: unknown }).viewLanguages ?? null);
    if (!normalizedView || normalizedView.length === 0) {
      return NextResponse.json({ error: 'Members must have at least one view language.' }, { status: 400 });
    }

    const normalizedEdit = normalizeLanguageArray((payload as { editLanguages?: unknown }).editLanguages ?? null) ?? [];
    const viewSet = new Set(normalizedView);
    for (const code of normalizedEdit) {
      if (!viewSet.has(code)) {
        return NextResponse.json({ error: 'Edit languages must be a subset of view languages.' }, { status: 400 });
      }
    }

    viewLanguages = normalizedView;
    editLanguages = normalizedEdit;
  }

  if (!isPlatformAdmin) {
    const { data: membership, error: membershipError } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', requester.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: 'Failed to verify project permissions.' }, { status: 500 });
    }

    if (!membership || membership.role !== 'owner') {
      return unauthorized('Insufficient permissions.', 403);
    }
  }

  const { data: listResult, error: lookupError } = await supabase.auth.admin.listUsers();

  if (lookupError) {
    return NextResponse.json({ error: 'Failed to look up user in Supabase Auth.' }, { status: 500 });
  }

  const matchingUser = listResult?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;
  let targetUser = matchingUser;

  if (!targetUser) {
    const { data: invitedUser, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
    if (inviteError || !invitedUser?.user) {
      return NextResponse.json({ error: 'Unable to create or invite the specified user.' }, { status: 500 });
    }
    targetUser = invitedUser.user;
  }

  const { data: existing, error: membershipError } = await supabase
    .from('project_members')
    .select('id, role, view_languages, edit_languages')
    .eq('project_id', projectId)
    .eq('user_id', targetUser.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: 'Failed to check existing project membership.' }, { status: 500 });
  }

  const nextView = role === 'member' ? viewLanguages : null;
  const nextEdit = role === 'member' ? editLanguages ?? [] : null;

  if (existing) {
    const existingView = Array.isArray(existing.view_languages) ? [...existing.view_languages].sort() : null;
    const existingEdit = Array.isArray(existing.edit_languages) ? [...existing.edit_languages].sort() : null;
    const requiresUpdate =
      existing.role !== role ||
      !arraysEqual(existingView, nextView) ||
      !arraysEqual(existingEdit, nextEdit);

    if (requiresUpdate) {
      const { error: updateError } = await supabase
        .from('project_members')
        .update({
          role,
          view_languages: role === 'member' ? nextView : null,
          edit_languages: role === 'member' ? nextEdit : null,
        })
        .eq('id', existing.id);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update member access.' }, { status: 500 });
      }

      return NextResponse.json({
        status: 'updated',
        member: {
          id: existing.id,
          userId: targetUser.id,
          role,
          email: targetUser.email,
          viewLanguages: role === 'member' ? nextView : null,
          editLanguages: role === 'member' ? nextEdit : null,
        },
      });
    }

    return NextResponse.json({
      status: 'unchanged',
      member: {
        id: existing.id,
        userId: targetUser.id,
        role,
        email: targetUser.email,
        viewLanguages: role === 'member' ? existingView ?? [] : null,
        editLanguages: role === 'member' ? existingEdit ?? [] : null,
      },
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('project_members')
    .insert({
      project_id: projectId,
      user_id: targetUser.id,
      role,
      view_languages: role === 'member' ? nextView : null,
      edit_languages: role === 'member' ? nextEdit : null,
    })
    .select('id, user_id, role, view_languages, edit_languages, created_at')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: 'Failed to add member to the project.' }, { status: 500 });
  }

  return NextResponse.json({
    status: 'created',
    member: {
      id: inserted.id,
      userId: inserted.user_id,
      role: inserted.role,
      email: targetUser.email,
      viewLanguages: role === 'member' ? nextView : null,
      editLanguages: role === 'member' ? nextEdit : null,
      createdAt: inserted.created_at,
    },
  });
}

export async function DELETE(req: Request) {
  const auth = await resolveRequester(req);
  if ('response' in auth) return auth.response;

  const { supabase, requester, isPlatformAdmin } = auth;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const memberId = searchParams.get('memberId');

  if (!projectId || !memberId) {
    return NextResponse.json({ error: 'projectId and memberId query parameters are required.' }, { status: 400 });
  }

  if (!isPlatformAdmin) {
    const { data: membership, error: membershipError } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', requester.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: 'Failed to verify project permissions.' }, { status: 500 });
    }

    if (!membership || membership.role !== 'owner') {
      return unauthorized('Insufficient permissions.', 403);
    }
  }

  // Fetch the target member's role and the total owner count in one go to guard
  // against orphaning the project by removing its last owner.
  const { data: targetMember, error: targetError } = await supabase
    .from('project_members')
    .select('role')
    .eq('id', memberId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: 'Failed to verify member record.' }, { status: 500 });
  }

  if (!targetMember) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  if (targetMember.role === 'owner') {
    const { count, error: countError } = await supabase
      .from('project_members')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('role', 'owner');

    if (countError) {
      return NextResponse.json({ error: 'Failed to verify owner count.' }, { status: 500 });
    }

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last owner. Assign another owner before removing this member.' },
        { status: 409 }
      );
    }
  }

  const { error: deleteError } = await supabase
    .from('project_members')
    .delete()
    .eq('id', memberId)
    .eq('project_id', projectId);

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to remove member.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'deleted' });
}
