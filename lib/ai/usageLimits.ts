import type { SupabaseClient } from '@supabase/supabase-js';
import { AiProviderError } from './errors';
import { logAi } from './logging';

const DEFAULT_USER_CONCURRENCY = 2;
const DEFAULT_PROJECT_CONCURRENCY = 4;
const DEFAULT_USER_HOURLY_WORK_UNITS = 500000;
const DEFAULT_PROJECT_HOURLY_WORK_UNITS = 2000000;
const DEFAULT_LEASE_SECONDS = 900;

type UsageReservation = {
  allowed?: boolean;
  reason?: string | null;
  retry_after_seconds?: number | null;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function reserveAiTranslationUsage(params: {
  supabaseAdmin: SupabaseClient;
  requestId: string;
  userId: string;
  projectId: string;
  workUnits: number;
}): Promise<boolean> {
  if (process.env.AI_USAGE_LIMITS_ENABLED !== 'true') return false;

  const { data, error } = await params.supabaseAdmin.rpc('reserve_ai_translation_usage', {
    p_request_id: params.requestId,
    p_user_id: params.userId,
    p_project_id: params.projectId,
    p_work_units: params.workUnits,
    p_user_concurrency_limit: positiveInteger(
      process.env.AI_USER_CONCURRENCY_LIMIT,
      DEFAULT_USER_CONCURRENCY
    ),
    p_project_concurrency_limit: positiveInteger(
      process.env.AI_PROJECT_CONCURRENCY_LIMIT,
      DEFAULT_PROJECT_CONCURRENCY
    ),
    p_user_hourly_work_limit: positiveInteger(
      process.env.AI_USER_HOURLY_WORK_LIMIT,
      DEFAULT_USER_HOURLY_WORK_UNITS
    ),
    p_project_hourly_work_limit: positiveInteger(
      process.env.AI_PROJECT_HOURLY_WORK_LIMIT,
      DEFAULT_PROJECT_HOURLY_WORK_UNITS
    ),
    p_lease_seconds: positiveInteger(
      process.env.AI_USAGE_LEASE_SECONDS,
      DEFAULT_LEASE_SECONDS
    ),
  });

  if (error) {
    logAi('error', 'usage_reservation_failed', {
      request_id: params.requestId,
      database_code: error.code,
    });
    throw new AiProviderError(
      'usage_control_unavailable',
      'AI translation is temporarily unavailable.'
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as UsageReservation | null;
  if (!row || typeof row.allowed !== 'boolean') {
    throw new AiProviderError(
      'usage_control_unavailable',
      'AI translation is temporarily unavailable.'
    );
  }
  if (!row.allowed) {
    throw new AiProviderError(
      'usage_limit',
      'AI translation limit reached. Please try again later.',
      {
        retryable: true,
        retryAfterSeconds: row.retry_after_seconds ?? undefined,
      }
    );
  }
  return true;
}

export async function releaseAiTranslationUsage(
  supabaseAdmin: SupabaseClient,
  requestId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('release_ai_translation_usage', {
    p_request_id: requestId,
  });
  if (error) {
    logAi('error', 'usage_release_failed', {
      request_id: requestId,
      database_code: error.code,
    });
  }
}
