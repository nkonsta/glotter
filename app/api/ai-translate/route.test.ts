import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AiProviderError } from '@/lib/ai/errors';
import {
  AI_MAX_ENTRIES_PER_REQUEST,
  AI_MAX_ENTRY_CHARACTERS,
  AI_MAX_GLOSSARY_TERM_CHARACTERS,
  AI_MAX_GLOSSARY_TERMS,
  AI_MAX_KEY_CHARACTERS,
  AI_MAX_LANGUAGE_CODE_CHARACTERS,
  AI_MAX_REQUEST_BYTES,
  AI_MAX_TARGET_LANGUAGES_PER_REQUEST,
  AI_MAX_TOTAL_SOURCE_CHARACTERS,
} from '@/lib/ai/limits';

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
  translateBatch: vi.fn(),
}));

vi.mock('@/lib/serverSupabase', () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
}));

vi.mock('@/lib/ai/providers/openai', () => ({
  OpenAiProvider: class {
    translateBatch = mocks.translateBatch;
  },
}));

import { POST } from './route';

const projectId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

type ClientOptions = {
  admin?: boolean;
  membership?: { role: string; view_languages: string[] | null; edit_languages: string[] | null } | null;
  activeLanguages?: string[];
};

function queryResult(data: unknown, error: unknown = null) {
  return Promise.resolve({ data, error });
}

function createSupabaseClient(options: ClientOptions = {}) {
  const activeLanguages = options.activeLanguages ?? ['en', 'fr'];
  return {
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
        maybeSingle: vi.fn(() => table === 'platform_admins'
          ? queryResult(options.admin === false ? null : { user_id: userId })
          : queryResult(options.membership ?? null)),
        in: vi.fn(() => queryResult(activeLanguages.map(language_code => ({ language_code })))),
      };
      return chain;
    }),
    rpc: vi.fn(),
  };
}

function request(body: unknown, authenticated = true) {
  return new NextRequest('http://localhost/api/ai-translate', {
    method: 'POST',
    headers: authenticated ? { authorization: 'Bearer session-token' } : undefined,
    body: JSON.stringify(body),
  });
}

function validBody(entries = [{ key: 'welcome', text: 'Welcome' }]) {
  return {
    projectId,
    sourceLanguage: 'en',
    targetLanguages: ['fr'],
    entries,
    options: { preservePlaceholders: true, dryRun: true },
  };
}

describe('POST /api/ai-translate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AI_USAGE_LIMITS_ENABLED', 'false');
    vi.stubEnv('AI_BATCH_SIZE', '1');
    vi.stubEnv('AI_GROUP_SIZE', '1');
    mocks.getSupabaseAdminClient.mockReturnValue(createSupabaseClient());
    mocks.translateBatch.mockResolvedValue({
      outputs: ['Bienvenue'],
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      providerRequestId: 'provider-1',
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects unauthenticated requests before reading the payload', async () => {
    const response = await POST(request(validBody(), false));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'authentication_required', retryable: false },
    });
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('returns a strict success response for an authorized request', async () => {
    const response = await POST(request(validBody()));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      translations: {
        fr: [{ key: 'welcome', aiText: 'Bienvenue' }],
      },
      failures: [],
    });
  });

  it('enforces member source and target language permissions', async () => {
    mocks.getSupabaseAdminClient.mockReturnValue(createSupabaseClient({
      admin: false,
      membership: { role: 'member', view_languages: ['en'], edit_languages: ['de'] },
    }));
    const response = await POST(request(validBody()));
    expect(response.status).toBe(403);
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('rejects inactive project languages', async () => {
    mocks.getSupabaseAdminClient.mockReturnValue(createSupabaseClient({ activeLanguages: ['en'] }));
    const response = await POST(request(validBody()));
    expect(response.status).toBe(400);
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and malformed payload fields', async () => {
    const malformedJson = new NextRequest('http://localhost/api/ai-translate', {
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: '{',
    });
    expect((await POST(malformedJson)).status).toBe(400);
    expect((await POST(request({ ...validBody(), entries: [{ key: 'welcome' }] }))).status).toBe(400);
    expect((await POST(request({ ...validBody(), options: [] }))).status).toBe(400);
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('rejects duplicate, source-matching, and oversized language codes', async () => {
    expect((await POST(request({
      ...validBody(),
      targetLanguages: ['fr', 'FR'],
    }))).status).toBe(400);
    expect((await POST(request({
      ...validBody(),
      targetLanguages: ['en'],
    }))).status).toBe(400);
    expect((await POST(request({
      ...validBody(),
      targetLanguages: ['x'.repeat(AI_MAX_LANGUAGE_CODE_CHARACTERS + 1)],
    }))).status).toBe(400);
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('rejects target-language and entry-count overflow', async () => {
    const tooManyTargets = await POST(request({
      ...validBody(),
      targetLanguages: Array.from(
        { length: AI_MAX_TARGET_LANGUAGES_PER_REQUEST + 1 },
        (_, index) => `l${index}`
      ),
    }));
    expect(tooManyTargets.status).toBe(400);

    const tooManyEntries = await POST(request(validBody(Array.from(
      { length: AI_MAX_ENTRIES_PER_REQUEST + 1 },
      (_, index) => ({ key: `key-${index}`, text: 'value' })
    ))));
    expect(tooManyEntries.status).toBe(400);
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('rejects oversized entries and glossaries', async () => {
    const oversizedEntry = await POST(request(validBody([
      { key: 'large', text: 'x'.repeat(AI_MAX_ENTRY_CHARACTERS + 1) },
    ])));
    expect(oversizedEntry.status).toBe(400);

    const oversizedGlossary = await POST(request({
      ...validBody(),
      options: {
        glossary: Array.from(
          { length: AI_MAX_GLOSSARY_TERMS + 1 },
          (_, index) => ({ source: `source-${index}`, target: `target-${index}` })
        ),
      },
    }));
    expect(oversizedGlossary.status).toBe(400);
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('rejects oversized keys, total source text, and glossary terms', async () => {
    const oversizedKey = await POST(request(validBody([
      { key: 'k'.repeat(AI_MAX_KEY_CHARACTERS + 1), text: 'value' },
    ])));
    expect(oversizedKey.status).toBe(400);

    const oversizedTotal = await POST(request(validBody(Array.from(
      { length: Math.floor(AI_MAX_TOTAL_SOURCE_CHARACTERS / AI_MAX_ENTRY_CHARACTERS) + 1 },
      (_, index) => ({ key: `key-${index}`, text: 'x'.repeat(AI_MAX_ENTRY_CHARACTERS) })
    ))));
    expect(oversizedTotal.status).toBe(400);

    const oversizedGlossaryTerm = await POST(request({
      ...validBody(),
      options: {
        glossary: [{
          source: 'x'.repeat(AI_MAX_GLOSSARY_TERM_CHARACTERS + 1),
          target: 'valid',
        }],
      },
    }));
    expect(oversizedGlossaryTerm.status).toBe(400);
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('rejects a declared oversized request before authentication or parsing', async () => {
    const oversizedRequest = new NextRequest('http://localhost/api/ai-translate', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-token',
        'content-length': String(AI_MAX_REQUEST_BYTES + 1),
      },
      body: '{}',
    });
    const response = await POST(oversizedRequest);
    expect(response.status).toBe(413);
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects an oversized body when content-length is unavailable', async () => {
    const oversizedRequest = new NextRequest('http://localhost/api/ai-translate', {
      method: 'POST',
      headers: { authorization: 'Bearer session-token' },
      body: JSON.stringify({ padding: 'x'.repeat(AI_MAX_REQUEST_BYTES) }),
    });
    const response = await POST(oversizedRequest);
    expect(response.status).toBe(413);
    expect(mocks.translateBatch).not.toHaveBeenCalled();
  });

  it('preserves successful provider batches when a later batch times out', async () => {
    mocks.translateBatch
      .mockResolvedValueOnce({
        outputs: ['Bienvenue'],
        usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      })
      .mockRejectedValueOnce(new AiProviderError(
        'provider_timeout',
        'The translation provider timed out.',
        { retryable: true }
      ));
    const response = await POST(request(validBody([
      { key: 'welcome', text: 'Welcome' },
      { key: 'goodbye', text: 'Goodbye' },
    ])));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      translations: { fr: [{ key: 'welcome', aiText: 'Bienvenue' }] },
      failures: [{
        targetLanguage: 'fr',
        keys: ['goodbye'],
        code: 'provider_timeout',
        retryable: true,
      }],
    });
  });

  it('maps a complete provider authentication failure to a safe 503 response', async () => {
    mocks.translateBatch.mockRejectedValueOnce(new AiProviderError(
      'provider_authentication',
      'The translation provider is not configured correctly.'
    ));
    const response = await POST(request(validBody()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'provider_authentication',
        message: 'The translation provider is not configured correctly.',
        retryable: false,
      },
    });
  });
});
