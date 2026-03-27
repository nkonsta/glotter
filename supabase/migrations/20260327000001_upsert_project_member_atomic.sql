-- Atomically upserts a project member (insert or update role/languages) while
-- guarding against orphaning the project by demoting its last owner.
--
-- Like remove_project_member, admin bypass is derived from platform_admins
-- inside the function rather than accepted as a caller-supplied flag, and
-- execute is restricted to service_role.
--
-- The target row is locked with FOR UPDATE before any check so that two
-- concurrent demotions of the last two owners cannot both pass the
-- owner-count guard and both proceed.
--
-- Return values:
--   'created'            – new member row inserted
--   'updated'            – existing row updated
--   'unchanged'          – row exists and no fields changed
--   'last_owner'         – changing role would leave the project without an
--                          owner; operation refused
--   'permission_denied'  – requester is neither a platform admin nor an owner

create or replace function upsert_project_member(
    p_project_id    uuid,
    p_requester_id  uuid,
    p_target_user_id uuid,
    p_role          text,
    p_view_languages text[],
    p_edit_languages text[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_existing_id    uuid;
    v_existing_role  text;
    v_owner_count    int;
    v_requester_role text;
    v_is_admin       boolean;
begin
    -- 1. Derive admin status from the database; never trust a caller flag.
    select exists(
        select 1 from platform_admins where user_id = p_requester_id
    ) into v_is_admin;

    -- 2. Non-admin callers must be a project owner.
    if not v_is_admin then
        select role
          into v_requester_role
          from project_members
         where project_id = p_project_id
           and user_id    = p_requester_id;

        if v_requester_role is distinct from 'owner' then
            return 'permission_denied';
        end if;
    end if;

    -- 3. Lock the existing row (if any) to serialise concurrent updates.
    select id, role
      into v_existing_id, v_existing_role
      from project_members
     where project_id = p_project_id
       and user_id    = p_target_user_id
    for update;

    -- 4. If we are demoting an existing owner to a non-owner role, ensure
    --    at least one other owner remains.
    if found and v_existing_role = 'owner' and p_role <> 'owner' then
        select count(*)
          into v_owner_count
          from project_members
         where project_id = p_project_id
           and role       = 'owner';

        if v_owner_count <= 1 then
            return 'last_owner';
        end if;
    end if;

    -- 5. Insert or update.
    if found then
        -- No-op if nothing changed.
        if v_existing_role = p_role
           and (p_view_languages is not distinct from (
                    select view_languages from project_members where id = v_existing_id))
           and (p_edit_languages is not distinct from (
                    select edit_languages from project_members where id = v_existing_id))
        then
            return 'unchanged';
        end if;

        update project_members
           set role            = p_role,
               view_languages  = p_view_languages,
               edit_languages  = p_edit_languages
         where id = v_existing_id;

        return 'updated';
    else
        insert into project_members
            (project_id, user_id, role, view_languages, edit_languages)
        values
            (p_project_id, p_target_user_id, p_role, p_view_languages, p_edit_languages);

        return 'created';
    end if;
end;
$$;

revoke execute on function upsert_project_member(uuid, uuid, uuid, text, text[], text[])
    from public, anon, authenticated;

grant execute on function upsert_project_member(uuid, uuid, uuid, text, text[], text[])
    to service_role;


-- Helper: look up a single Supabase Auth user by email address.
-- auth.users is only accessible to SECURITY DEFINER functions running as a
-- superuser role; the JS admin client's listUsers() has no email filter and
-- returns a single page of results, so a large auth.users table silently
-- misses users beyond the first page.  This function avoids that pagination
-- gap and the N-user memory allocation.
--
-- Returns (id, email) or zero rows if not found.

create or replace function find_auth_user_by_email(p_email text)
returns table(id uuid, email text)
language sql
security definer
set search_path = auth, public
as $$
    select id, email::text
      from auth.users
     where lower(email) = lower(p_email)
     limit 1;
$$;

revoke execute on function find_auth_user_by_email(text)
    from public, anon, authenticated;

grant execute on function find_auth_user_by_email(text)
    to service_role;
