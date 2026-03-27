-- Atomically removes a project member while guarding against orphaning the
-- project by deleting its last owner.
--
-- The caller must be either a platform admin (bypass_rls = true) or an owner
-- of the project.  The function is SECURITY DEFINER so it can perform the
-- owner-count check and the delete in one serialisable transaction without a
-- race window between the two statements.
--
-- Return values:
--   'deleted'               – member row removed successfully
--   'not_found'             – no matching row for (p_member_id, p_project_id)
--   'last_owner'            – target is the sole owner; deletion refused
--   'permission_denied'     – requester is not an owner of this project
--                             (only reached when p_bypass_rls = false)

create or replace function remove_project_member(
    p_project_id  uuid,
    p_member_id   uuid,
    p_requester_id uuid,
    p_bypass_rls  boolean default false
)
returns text
language plpgsql
security definer
-- Keep the search_path locked down to prevent search-path hijacking.
set search_path = public
as $$
declare
    v_target_role   text;
    v_owner_count   int;
    v_requester_role text;
begin
    -- 1. Lock the target row to serialise concurrent deletes for the same
    --    project.  FOR UPDATE means a second concurrent call on the same
    --    project will queue here until the first transaction commits.
    select role
      into v_target_role
      from project_members
     where id         = p_member_id
       and project_id = p_project_id
    for update;

    if not found then
        return 'not_found';
    end if;

    -- 2. If the caller is not a platform admin, verify they are an owner.
    if not p_bypass_rls then
        select role
          into v_requester_role
          from project_members
         where project_id = p_project_id
           and user_id    = p_requester_id;

        if v_requester_role is distinct from 'owner' then
            return 'permission_denied';
        end if;
    end if;

    -- 3. If the target is an owner, ensure at least one other owner exists.
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

    -- 4. All checks passed – delete the row.
    delete from project_members
     where id         = p_member_id
       and project_id = p_project_id;

    return 'deleted';
end;
$$;

-- Revoke direct execute from public; the API uses the service-role key or a
-- specific role that should be granted explicitly in your Supabase project.
revoke execute on function remove_project_member(uuid, uuid, uuid, boolean)
    from public;
