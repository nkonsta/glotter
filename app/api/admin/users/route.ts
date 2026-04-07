import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';

type RequesterContext =
  | { requester: User; supabase: ReturnType<typeof getSupabaseAdminClient> }
  | { response: NextResponse };

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
  const allUsers: Awaited<ReturnType<typeof supabase.auth.admin.listUsers>>['data']['users'] = [];
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

  const users = allUsers.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    emailConfirmedAt: u.email_confirmed_at ?? null,
  }));

  return NextResponse.json({ users });
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

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password must be non-empty.' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    const message = createError?.message ?? 'Failed to create user.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    user: {
      id: created.user.id,
      email: created.user.email ?? null,
      createdAt: created.user.created_at,
    },
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
    return NextResponse.json({ error: 'Failed to remove platform admin record.' }, { status: 500 });
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message ?? 'Failed to delete user.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
