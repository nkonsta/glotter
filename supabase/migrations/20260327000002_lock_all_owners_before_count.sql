-- Fixes a concurrency hole in both remove_project_member and
-- upsert_project_member: the previous versions locked only the target row,
-- so two concurrent operations on *different* owner rows could both observe
-- count >= 2 and both commit, leaving the project with zero owners.
--
-- The fix: lock ALL owner rows for the project before counting.  Any two
-- concurrent operations that touch owners for the same project will then
-- serialise at the lock step, making the subsequent count accurate.

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
    -- 1. Lock ALL owner rows for this project so that two concurrent
    --    operations on different owners serialise here rather than racing
    --    past the owner-count check independently.
    perform id
      from project_members
     where project_id = p_project_id
       and role       = 'owner'
    for update;

    -- 2. Now fetch the target row's role (already locked above if owner;
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

    -- 3. Derive admin status from the database; never trust a caller flag.
    select exists(
        select 1 from platform_admins where user_id = p_requester_id
    ) into v_is_admin;

    -- 4. Non-admin callers must be a project owner.
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


create or replace function upsert_project_member(
    p_project_id     uuid,
    p_requester_id   uuid,
    p_target_user_id uuid,
    p_role           text,
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
    v_existing_view  text[];
    v_existing_edit  text[];
    v_owner_count    int;
    v_requester_role text;
    v_is_admin       boolean;
begin
    -- 1. Lock ALL owner rows for this project before counting, so two
    --    concurrent demotions of different owners cannot both observe a
    --    count >= 2 and both commit.
    perform id
      from project_members
     where project_id = p_project_id
       and role       = 'owner'
    for update;

    -- 2. Derive admin status from the database; never trust a caller flag.
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

    -- 4. Fetch the target's current row (already locked above if owner).
    select id, role, view_languages, edit_languages
      into v_existing_id, v_existing_role, v_existing_view, v_existing_edit
      from project_members
     where project_id = p_project_id
       and user_id    = p_target_user_id
    for update;

    -- 5. Guard against demoting the last owner.  Count is accurate because
    --    all owner rows are locked in step 1.
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

    -- 6. Insert or update.
    if found then
        if v_existing_role = p_role
           and (v_existing_view is not distinct from p_view_languages)
           and (v_existing_edit is not distinct from p_edit_languages)
        then
            return 'unchanged';
        end if;

        update project_members
           set role           = p_role,
               view_languages = p_view_languages,
               edit_languages = p_edit_languages
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
