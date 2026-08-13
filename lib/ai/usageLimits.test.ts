import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reserveAiTranslationUsage } from './usageLimits';

function clientWithRpc(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

describe('AI usage limits', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('does not call the database until durable limits are enabled', async () => {
    const rpc = vi.fn();
    const acquired = await reserveAiTranslationUsage({
      supabaseAdmin: clientWithRpc(rpc),
      requestId: 'request-1',
      userId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      workUnits: 10,
    });
    expect(acquired).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts an atomic database reservation', async () => {
    vi.stubEnv('AI_USAGE_LIMITS_ENABLED', 'true');
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, reason: null, retry_after_seconds: null }],
      error: null,
    });
    const acquired = await reserveAiTranslationUsage({
      supabaseAdmin: clientWithRpc(rpc),
      requestId: 'request-1',
      userId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      workUnits: 10,
    });
    expect(acquired).toBe(true);
  });

  it('returns a retryable limit error with Retry-After metadata', async () => {
    vi.stubEnv('AI_USAGE_LIMITS_ENABLED', 'true');
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, reason: 'user_hourly_work', retry_after_seconds: 120 }],
      error: null,
    });
    await expect(reserveAiTranslationUsage({
      supabaseAdmin: clientWithRpc(rpc),
      requestId: 'request-1',
      userId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      workUnits: 10,
    })).rejects.toMatchObject({
      code: 'usage_limit',
      retryable: true,
      retryAfterSeconds: 120,
    });
  });
});
