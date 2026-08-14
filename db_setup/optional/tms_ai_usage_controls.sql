-- Durable AI translation concurrency and hourly work budgets.
-- Apply once to an existing Glotter database before setting
-- AI_USAGE_LIMITS_ENABLED=true in the application environment.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.ai_translation_usage_windows (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('user', 'project')),
  scope_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  work_units BIGINT NOT NULL DEFAULT 0 CHECK (work_units >= 0),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (scope_type, scope_id, window_start)
);

CREATE TABLE IF NOT EXISTS private.ai_translation_leases (
  request_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_translation_leases_user_expires_idx
  ON private.ai_translation_leases (user_id, expires_at);
CREATE INDEX IF NOT EXISTS ai_translation_leases_project_expires_idx
  ON private.ai_translation_leases (project_id, expires_at);

ALTER TABLE private.ai_translation_usage_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_translation_leases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_ai_translation_usage(
  p_request_id TEXT,
  p_user_id UUID,
  p_project_id UUID,
  p_work_units BIGINT,
  p_user_concurrency_limit INTEGER,
  p_project_concurrency_limit INTEGER,
  p_user_hourly_work_limit BIGINT,
  p_project_hourly_work_limit BIGINT,
  p_lease_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, reason TEXT, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_window TIMESTAMPTZ := pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp());
  user_active INTEGER;
  project_active INTEGER;
  user_work BIGINT;
  project_work BIGINT;
  retry_seconds INTEGER;
BEGIN
  IF p_request_id IS NULL OR p_request_id = '' OR p_work_units <= 0
     OR p_user_concurrency_limit <= 0 OR p_project_concurrency_limit <= 0
     OR p_user_hourly_work_limit <= 0 OR p_project_hourly_work_limit <= 0
     OR p_lease_seconds <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid AI usage reservation parameters.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-user:' || p_user_id::TEXT, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-project:' || p_project_id::TEXT, 0)
  );

  DELETE FROM private.ai_translation_leases
  WHERE expires_at <= pg_catalog.clock_timestamp();

  SELECT pg_catalog.count(*)::INTEGER
  INTO user_active
  FROM private.ai_translation_leases
  WHERE user_id = p_user_id;

  IF user_active >= p_user_concurrency_limit THEN
    SELECT GREATEST(
      1,
      pg_catalog.ceil(EXTRACT(EPOCH FROM (
        pg_catalog.min(expires_at) - pg_catalog.clock_timestamp()
      )))::INTEGER
    )
    INTO retry_seconds
    FROM private.ai_translation_leases
    WHERE user_id = p_user_id;
    RETURN QUERY SELECT false, 'user_concurrency', retry_seconds;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO project_active
  FROM private.ai_translation_leases
  WHERE project_id = p_project_id;

  IF project_active >= p_project_concurrency_limit THEN
    SELECT GREATEST(
      1,
      pg_catalog.ceil(EXTRACT(EPOCH FROM (
        pg_catalog.min(expires_at) - pg_catalog.clock_timestamp()
      )))::INTEGER
    )
    INTO retry_seconds
    FROM private.ai_translation_leases
    WHERE project_id = p_project_id;
    RETURN QUERY SELECT false, 'project_concurrency', retry_seconds;
    RETURN;
  END IF;

  SELECT COALESCE(pg_catalog.max(work_units), 0::BIGINT)
  INTO user_work
  FROM private.ai_translation_usage_windows
  WHERE scope_type = 'user' AND scope_id = p_user_id AND window_start = current_window;

  SELECT COALESCE(pg_catalog.max(work_units), 0::BIGINT)
  INTO project_work
  FROM private.ai_translation_usage_windows
  WHERE scope_type = 'project' AND scope_id = p_project_id AND window_start = current_window;

  retry_seconds := GREATEST(
    1,
    pg_catalog.ceil(EXTRACT(EPOCH FROM (
      current_window + INTERVAL '1 hour' - pg_catalog.clock_timestamp()
    )))::INTEGER
  );

  IF user_work + p_work_units > p_user_hourly_work_limit THEN
    RETURN QUERY SELECT false, 'user_hourly_work', retry_seconds;
    RETURN;
  END IF;

  IF project_work + p_work_units > p_project_hourly_work_limit THEN
    RETURN QUERY SELECT false, 'project_hourly_work', retry_seconds;
    RETURN;
  END IF;

  INSERT INTO private.ai_translation_usage_windows (
    scope_type, scope_id, window_start, work_units, request_count
  ) VALUES (
    'user', p_user_id, current_window, p_work_units, 1
  )
  ON CONFLICT (scope_type, scope_id, window_start)
  DO UPDATE SET
    work_units = private.ai_translation_usage_windows.work_units + EXCLUDED.work_units,
    request_count = private.ai_translation_usage_windows.request_count + 1;

  INSERT INTO private.ai_translation_usage_windows (
    scope_type, scope_id, window_start, work_units, request_count
  ) VALUES (
    'project', p_project_id, current_window, p_work_units, 1
  )
  ON CONFLICT (scope_type, scope_id, window_start)
  DO UPDATE SET
    work_units = private.ai_translation_usage_windows.work_units + EXCLUDED.work_units,
    request_count = private.ai_translation_usage_windows.request_count + 1;

  INSERT INTO private.ai_translation_leases (request_id, user_id, project_id, expires_at)
  VALUES (
    p_request_id,
    p_user_id,
    p_project_id,
    pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds)
  );

  RETURN QUERY SELECT true, NULL::TEXT, NULL::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_translation_usage(p_request_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  DELETE FROM private.ai_translation_leases WHERE request_id = p_request_id;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

REVOKE ALL ON TABLE
  private.ai_translation_usage_windows,
  private.ai_translation_leases
FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  private.ai_translation_usage_windows,
  private.ai_translation_leases
TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_ai_translation_usage(
  TEXT, UUID, UUID, BIGINT, INTEGER, INTEGER, BIGINT, BIGINT, INTEGER
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_ai_translation_usage(TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_translation_usage(
  TEXT, UUID, UUID, BIGINT, INTEGER, INTEGER, BIGINT, BIGINT, INTEGER
) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_translation_usage(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback:
-- DROP FUNCTION public.release_ai_translation_usage(TEXT);
-- DROP FUNCTION public.reserve_ai_translation_usage(TEXT, UUID, UUID, BIGINT, INTEGER, INTEGER, BIGINT, BIGINT, INTEGER);
-- DROP TABLE private.ai_translation_leases;
-- DROP TABLE private.ai_translation_usage_windows;
