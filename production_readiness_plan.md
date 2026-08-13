# Production Readiness Plan

This document tracks the remaining work required before exposing Glotter to
production users. The access-management work in `user_management_plan.md` is
complete; the items below are focused on the AI translation path and final
deployment checks.

## Already complete

- User management, project access, and the RLS/database audit are complete.
- The AI endpoint authenticates the Supabase bearer token and authorizes the
  user against the requested project and language permissions.
- Request size, entry count, source length, target-language, and glossary
  limits are enforced server-side.
- "Translate all" is split into bounded entry and language batches, so the UI
  can process the full selection without sending an unbounded request.
- Lint, TypeScript, production build, limit-boundary checks, unauthenticated
  rejection, oversized-request rejection, and a real authenticated OpenAI
  translation have passed.
- AI dialogs disclose that selected source text is sent to the configured
  provider; production logs do not include translation content.

## Required before production

### 1. Correct provider failure handling

- [x] Retry only transient failures such as timeouts, `429`, and provider `5xx`
  responses; do not retry invalid credentials or other permanent `4xx` errors.
- [x] Stop converting a completely failed provider batch into empty suggestions
  with an HTTP `200` response.
- [x] Return a stable, user-safe error response for provider authentication,
  rate-limit, timeout, malformed-output, and unavailable-provider failures.
- [x] Preserve successful batches when only part of a multi-batch request fails,
  and identify the failed language or entries clearly in the review UI.
- [x] Wire client cancellation through to the provider request so closing or
  cancelling a translation stops unnecessary work.

### 2. Add durable abuse and cost controls

- [x] Replace the in-process `MAX_IN_FLIGHT` counter with a shared limit that
  works across serverless instances, scoped at least by user and project.
- [x] Add a practical per-user or per-project usage budget over a time window so
  repeated bounded requests cannot create unbounded provider spend.
- [x] Return `429` with a clear retry message when a limit is reached.
- [ ] Set `AI_USAGE_LIMITS_ENABLED=true` in the production deployment. The
  connected Supabase project already has the required database migration.

### 3. Make AI logging production-safe

- [x] Disable prompt and translation previews in production; logs should record
  request ID, model, counts, duration, status, and error category without source
  or translated text.
- [x] Avoid logging raw provider response bodies for expected failures.
- [x] Prevent browsers, proxies, and CDNs from storing AI API responses.
- [x] Add enough structured logging or monitoring to identify error rate,
  latency, retry frequency, and provider usage without exposing translation
  content.

### 4. Add focused automated coverage

- [x] Test endpoint authentication, project access, member language permissions,
  inactive languages, malformed payloads, and every request boundary.
- [x] Test UI entry/language batching across boundary sizes and partial failures.
- [x] Test provider success, placeholder preservation, malformed output,
  transient retry, permanent failure, timeout, and cancellation with a mocked
  provider.
- [x] Keep one opt-in smoke test for the real provider; it must never run as part
  of the normal test suite or expose the API key.

### 5. Model decision

- [x] `gpt-5.6-luna` selected on 2026-08-13. Model comparison is not a launch
  gate; review real translation quality and usage after launch before changing
  models again. No model-selection UI is required.

### 6. Final deployment verification

- [ ] Configure production OpenAI and Supabase secrets and the production site
  URL without exposing server-only keys to the client bundle.
- [ ] Configure the production Supabase Auth redirect URL and decide whether
  public sign-up remains enabled.
- [x] Run lint, TypeScript, production build, and the focused automated tests.
- [ ] In the deployed app, verify one authorized row translation, one small
  "Translate all" run, review/apply, persistence, and an unauthorized rejection.
- [ ] Confirm the provider dashboard shows only the expected smoke-test usage.
- [ ] Upgrade Next.js from `16.2.6` to a patched release and rerun `npm audit`;
  the current dependency tree retains three high-severity advisories, and the
  suggested remediation requires a framework version change.

## Accepted or optional after launch

- Leaked-password protection remains unavailable on the connected Supabase
  Free plan; the managed account flows retain the 12-character minimum.
- MFA, invitation emails, pending-invitation acceptance, required project
  ownership, background translation jobs, Batch API use, model-selection UI,
  and detailed usage analytics are useful follow-ups but are not required for
  the initial production release.

## Definition of done

Production readiness is complete when every item in **Required before
production** is checked, the deployed smoke test passes, and no test translation
or diagnostic data remains in a production project.
