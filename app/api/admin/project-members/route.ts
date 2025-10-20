import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type RequesterContext =
  | { requester: User; supabase: ReturnType<typeof getSupabaseAdminClient> }
  | { response: NextResponse };

const ALLOWED_ROLES = ['editor', 'viewer'] as const;
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

  if (!adminMatch) {
    return { response: unauthorized('Insufficient permissions.', 403) };
  }

  return { requester: data.user, supabase };
}

export async function GET(req: Request) {
  const auth = await resolveRequester(req);
  if ('response' in auth) return auth.response;

  const { supabase } = auth;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId query parameter is required.' }, { status: 400 });
  }

  const { data: members, error } = await supabase
    .from('project_members')
    .select('id, user_id, role, created_at')
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
    return NextResponse.json({ error: 'Role must be either "editor" or "viewer".' }, { status: 400 });
  }

  const role = roleValue as AllowedRole;

  const { data: listResult, error: lookupError } = await supabase.auth.admin.listUsers({ email });

  if (lookupError) {
    return NextResponse.json({ error: 'Failed to look up user in Supabase Auth.' }, { status: 500 });
  }

  let targetUser = listResult?.users?.[0] ?? null;

  if (!targetUser) {
    const { data: invitedUser, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
    if (inviteError || !invitedUser?.user) {
      return NextResponse.json({ error: 'Unable to create or invite the specified user.' }, { status: 500 });
    }
    targetUser = invitedUser.user;
  }

  const { data: existing, error: membershipError } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('project_id', projectId)
    .eq('user_id', targetUser.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: 'Failed to check existing project membership.' }, { status: 500 });
  }

  if (existing) {
    if (existing.role !== role) {
      const { error: updateError } = await supabase
        .from('project_members')
        .update({ role })
        .eq('id', existing.id);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update member role.' }, { status: 500 });
      }
    }

    return NextResponse.json({
      status: existing.role === role ? 'unchanged' : 'updated',
      member: {
        id: existing.id,
        userId: targetUser.id,
        role,
        email: targetUser.email,
      },
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('project_members')
    .insert({
      project_id: projectId,
      user_id: targetUser.id,
      role,
    })
    .select('id, user_id, role, created_at')
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
      createdAt: inserted.created_at,
    },
  });
}
