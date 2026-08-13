import type { SupabaseClient, User } from '@supabase/supabase-js';

const AUTH_USERS_PER_PAGE = 1000;

export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{ user: User | null; error: Error | null }> {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PER_PAGE,
    });

    if (error) {
      return { user: null, error };
    }

    const users = data?.users ?? [];
    const user = users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
    if (user) {
      return { user, error: null };
    }

    if (users.length < AUTH_USERS_PER_PAGE) {
      return { user: null, error: null };
    }

    page += 1;
  }
}
