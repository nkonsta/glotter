-- Disable the unused GraphQL API surface. The application uses Supabase's
-- REST Data API and does not call pg_graphql.

BEGIN;

DROP EXTENSION IF EXISTS pg_graphql;

COMMIT;

-- Rollback:
-- CREATE EXTENSION pg_graphql;
