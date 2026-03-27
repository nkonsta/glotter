-- Atomically removes a project member while guarding against orphaning the
-- project by deleting its last owner.
--
-- Admin bypass is determined entirely from the platform_admins table using
-- p_requester_id.  There is no caller-supplied bypass flag; a SECURITY
-- DEFINER function that accepted such a flag would be a privilege-escalation
-- vector for any role that can invoke the function.
--
-- Execute is granted only to service_role (the key used by the Next.js API
-- routes).  anon and authenticated are explicitly revoked so the function
-- cannot be reached directly via the Supabase REST/RPC endpoint by end users.
--
-- Return values:
--   'deleted'            – member row removed successfully
--   'not_found'          – no matching row for (p_member_id, p_project_id)
--   'last_owner'         – target is the sole owner; deletion refused
--   'permission_denied'  – requester is neither a platform admin nor a project
--                          owner

create or replace function remove_project_member(
    p_project_id   uuid,
    p_member_id    uuid,
    p_requester_id uuid
)
returns text
language plpgsql
security definer
-- Lock the search_path to prevent search-path-hijacking attacks against a
-- SECURITY DEFINER function.
set search_path = public
as $$
declare
    v_target_role    text;
    v_owner_count    int;
    v_requester_role text;
    v_is_admin       boolean;
begin
    -- 1. Lock the target row to serialise concurrent deletes for the same
    --    project.  FOR UPDATE means a second concurrent call blocks here
    --    until the first transaction commits, closing the TOCTOU window.
    select role
      into v_target_role
      from project_members
     where id         = p_member_id
       and project_id = p_project_id
    for update;

    if not found then
        return 'not_found';
    end if;

    -- 2. Derive admin status from the database rather than trusting a
    --    caller-supplied flag.  platform_admins is only writable by
    --    service_role, so this cannot be spoofed via the RPC surface.
    select exists(
        select 1 from platform_admins where user_id = p_requester_id
    ) into v_is_admin;

    -- 3. Non-admin callers must be a project owner.
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

    -- 4. If the target is an owner, ensure at least one other owner exists.
    if v_target_role = 'owner' then
        select count(*)
          into v_owner_count
          from project_members
         where project_id = p_project_id
           and role       = 'owner';

        if v_owner_count <= 1 then
            return 'last_owner';
        end if;
    end if;

    -- 5. All checks passed – delete the row.
    delete from project_members
     where id         = p_member_id
       and project_id = p_project_id;

    return 'deleted';
end;
$$;

-- Restrict execution to service_role (the server-side API key).
-- anon and authenticated must be explicitly denied because Supabase grants
-- them execute on new functions by default, and revoking only from public is
-- insufficient in that model.
revoke execute on function remove_project_member(uuid, uuid, uuid)
    from public, anon, authenticated;

grant execute on function remove_project_member(uuid, uuid, uuid)
    to service_role;
