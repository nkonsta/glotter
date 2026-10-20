-- Add project-scoped API keys for read-only translation export.
-- Keys are stored as SHA-256 hashes and are reachable only by the service
-- role; the Next.js API creates, lists, revokes, and verifies them.

BEGIN;

CREATE TABLE public.project_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_project_api_keys_project ON public.project_api_keys(project_id);

-- RLS with no policies: signed-in users cannot read key metadata or hashes
-- through the Data API.
ALTER TABLE public.project_api_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.project_api_keys FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.project_api_keys TO service_role;

COMMIT;

-- Rollback:
-- DROP TABLE public.project_api_keys;
