import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/serverSupabase', () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
}));

import { POST } from './route';

const projectId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

describe('POST /api/translations/bulk-save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('splits large imports into PostgREST-safe batches', async () => {
    const keyBatchSizes: number[] = [];
    const translationBatchSizes: number[] = [];

    mocks.getSupabaseAdminClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: userId } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { user_id: userId },
            error: null,
          }),
          in: vi.fn((_column: string, values: string[]) => {
            if (table === 'project_languages') {
              return Promise.resolve({
                data: [{ id: 'language-en', language_code: 'en' }],
                error: null,
              });
            }

            keyBatchSizes.push(values.length);
            return Promise.resolve({
              data: values.map((key) => ({ id: `id-${key}`, key })),
              error: null,
            });
          }),
          upsert: vi.fn((rows: unknown[]) => {
            translationBatchSizes.push(rows.length);
            return Promise.resolve({ error: null });
          }),
        };
        return chain;
      }),
    });

    const entries = Array.from({ length: 985 }, (_, index) => ({
      key: `section.translation-${index}`,
      langCode: 'en',
      value: `Value ${index}`,
    }));
    const response = await POST(new Request('http://localhost/api/translations/bulk-save', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ projectId, entries, chunkSize: 1000 }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 985 });
    expect(keyBatchSizes).toHaveLength(10);
    expect(Math.max(...keyBatchSizes)).toBe(100);
    expect(translationBatchSizes).toHaveLength(10);
    expect(Math.max(...translationBatchSizes)).toBe(100);
  });
});
