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

  const { supabase, requester } = auth;

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

  // Authorise before touching auth.users or sending any invitation email.
  // upsert_project_member enforces this too, but by then inviteUserByEmail
  // has already fired — a side effect that cannot be rolled back if the DB
  // function later refuses the operation.
  const { data: adminMatch, error: adminCheckError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', requester.id)
    .maybeSingle();

  if (adminCheckError) {
    return NextResponse.json({ error: 'Failed to verify admin access.' }, { status: 500 });
  }

  if (!adminMatch) {
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

  // Resolve the target user by email using a SQL function that queries
  // auth.users directly.  The JS admin client's listUsers() fetches one page
  // of results with no email filter, so it silently misses users beyond the
  // first page and would incorrectly invite an already-registered account.
  const { data: foundUsers, error: lookupError } = await supabase.rpc('find_auth_user_by_email', {
    p_email: email,
  });

  if (lookupError) {
    return NextResponse.json({ error: 'Failed to look up user in Supabase Auth.' }, { status: 500 });
  }

  const foundUser = (foundUsers as { id: string; email: string }[] | null)?.[0] ?? null;
  let targetUserId: string;
  let targetEmail: string;

  if (foundUser) {
    targetUserId = foundUser.id;
    targetEmail = foundUser.email;
  } else {
    const { data: invitedUser, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
    if (inviteError || !invitedUser?.user) {
      return NextResponse.json({ error: 'Unable to create or invite the specified user.' }, { status: 500 });
    }
    targetUserId = invitedUser.user.id;
    targetEmail = invitedUser.user.email ?? email;
  }

  const nextView = role === 'member' ? viewLanguages : null;
  const nextEdit = role === 'member' ? (editLanguages ?? []) : null;

  // Delegate permission check, last-owner-demotion guard, and upsert to a
  // single SECURITY DEFINER function so they execute atomically under a
  // row-level lock, preventing a TOCTOU race identical to the one guarded
  // in remove_project_member.
  const { data: upsertResult, error: upsertError } = await supabase.rpc('upsert_project_member', {
    p_project_id:     projectId,
    p_requester_id:   requester.id,
    p_target_user_id: targetUserId,
    p_role:           role,
    p_view_languages: nextView,
    p_edit_languages: nextEdit,
  });

  if (upsertError) {
    return NextResponse.json({ error: 'Failed to save member.' }, { status: 500 });
  }

  if (upsertResult === 'permission_denied') {
    return unauthorized('Insufficient permissions.', 403);
  }

  if (upsertResult === 'last_owner') {
    return NextResponse.json(
      { error: 'Cannot demote the last owner. Assign another owner before changing this member\'s role.' },
      { status: 409 }
    );
  }

  return NextResponse.json({
    status: upsertResult,
    member: {
      userId: targetUserId,
      role,
      email: targetEmail,
      viewLanguages: nextView,
      editLanguages: nextEdit,
    },
  });
}

export async function DELETE(req: Request) {
  const auth = await resolveRequester(req);
  if ('response' in auth) return auth.response;

  const { supabase, requester } = auth;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const memberId = searchParams.get('memberId');

  if (!projectId || !memberId) {
    return NextResponse.json({ error: 'projectId and memberId query parameters are required.' }, { status: 400 });
  }

  // Delegate the permission check, last-owner guard, and delete to a single
  // SECURITY DEFINER database function so all three steps execute atomically
  // under a row-level lock. This prevents a TOCTOU race where two concurrent
  // requests both pass the owner-count check and both delete, leaving zero owners.
  const { data: result, error: rpcError } = await supabase.rpc('remove_project_member', {
    p_project_id:   projectId,
    p_member_id:    memberId,
    p_requester_id: requester.id,
  });

  if (rpcError) {
    return NextResponse.json({ error: 'Failed to remove member.' }, { status: 500 });
  }

  switch (result) {
    case 'deleted':
      return NextResponse.json({ status: 'deleted' });
    case 'not_found':
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    case 'last_owner':
      return NextResponse.json(
        { error: 'Cannot remove the last owner. Assign another owner before removing this member.' },
        { status: 409 }
      );
    case 'permission_denied':
      return unauthorized('Insufficient permissions.', 403);
    default:
      return NextResponse.json({ error: 'Unexpected result from remove_project_member.' }, { status: 500 });
  }
}
