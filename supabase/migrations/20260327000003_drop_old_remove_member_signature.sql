-- The original remove_project_member function accepted a caller-supplied
-- p_bypass_rls boolean that was a privilege-escalation vector.  It was
-- replaced with a three-parameter signature in a later migration, but
-- CREATE OR REPLACE only replaces a function with an identical signature, so
-- the four-parameter version still exists in the database.  Drop it
-- explicitly so the insecure signature cannot be re-granted accidentally.
drop function if exists remove_project_member(uuid, uuid, uuid, boolean);
