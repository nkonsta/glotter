-- Fixes a lock-based DoS path in remove_project_member.
--
-- The previous version locked ALL owner rows for the project (FOR UPDATE) in
-- step 1, and only then verified whether the requester is authorised.  Because
-- the DELETE /api/admin/project-members handler accepted any authenticated
-- caller, a non-owner who knew a projectId could hammer the endpoint and
-- contend on the owner-row locks, delaying legitimate owner operations even
-- though the function ultimately returned 'permission_denied'.
--
-- The fix: move the permission check to before the broad lock so that
-- unauthorised callers return immediately without ever acquiring any row locks.

create or replace function remove_project_member(
    p_project_id   uuid,
    p_member_id    uuid,
    p_requester_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_target_role    text;
    v_owner_count    int;
    v_requester_role text;
    v_is_admin       boolean;
begin
    -- 1. Derive admin status without holding any locks.
    select exists(
        select 1 from platform_admins where user_id = p_requester_id
    ) into v_is_admin;

    -- 2. Non-admin callers must be a project owner.  Return early before
    --    acquiring any locks so that an unauthorised caller cannot contend
    --    on the broad FOR UPDATE lock acquired in step 3.
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

    -- 3. Lock ALL owner rows for this project so that two concurrent
    --    operations on different owners serialise here rather than racing
    --    past the owner-count check independently.
    --    Only authorised callers reach this point.
    perform id
      from project_members
     where project_id = p_project_id
       and role       = 'owner'
    for update;

    -- 4. Fetch the target row's role (already locked above if owner;
    --    lock it here if it is a non-owner row so the delete is also safe).
    select role
      into v_target_role
      from project_members
     where id         = p_member_id
       and project_id = p_project_id
    for update;

    if not found then
        return 'not_found';
    end if;

    -- 5. If the target is an owner, ensure at least one other owner remains.
    --    The count is accurate because all owner rows are locked above.
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

    -- 6. All checks passed – delete the row.
    delete from project_members
     where id         = p_member_id
       and project_id = p_project_id;

    return 'deleted';
end;
$$;

revoke execute on function remove_project_member(uuid, uuid, uuid)
    from public, anon, authenticated;

grant execute on function remove_project_member(uuid, uuid, uuid)
    to service_role;
