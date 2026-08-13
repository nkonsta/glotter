import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function providerResponse(translations: string[], status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ translations }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), { status, headers });
}

async function loadProvider() {
  const providerModule = await import('./openai');
  return new providerModule.OpenAiProvider('gpt-5.6-luna');
}

describe('OpenAiProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('AI_MAX_RETRIES', '0');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses structured output and restores placeholders', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        response_format: unknown;
        messages: Array<{ content: string }>;
      };
      expect(body.response_format).toMatchObject({ type: 'json_schema' });
      const sentinel = body.messages[1].content.match(/__PH_\d+__/)?.[0];
      expect(sentinel).toBeTruthy();
      return providerResponse([`Bonjour ${sentinel}`], 200, { 'x-request-id': 'provider-1' });
    }));

    const provider = await loadProvider();
    const result = await provider.translateBatch({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      inputs: ['Hello {name}'],
    });

    expect(result.outputs).toEqual(['Bonjour {name}']);
    expect(result.providerRequestId).toBe('provider-1');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('Hello {name}');
  });

  it('does not retry permanent authentication failures', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = await loadProvider();

    await expect(provider.translateBatch({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      inputs: ['Hello'],
    })).rejects.toMatchObject({ code: 'provider_authentication', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limit and respects a zero Retry-After value', async () => {
    vi.stubEnv('AI_MAX_RETRIES', '1');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(providerResponse(['Bonjour']));
    vi.stubGlobal('fetch', fetchMock);
    const provider = await loadProvider();

    const result = await provider.translateBatch({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      inputs: ['Hello'],
    });

    expect(result.outputs).toEqual(['Bonjour']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed output without substituting empty translations', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => providerResponse([])));
    const provider = await loadProvider();

    await expect(provider.translateBatch({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      inputs: ['Hello'],
    })).rejects.toMatchObject({ code: 'provider_malformed_output', retryable: false });
  });

  it('stops an active provider request when cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    ));
    const provider = await loadProvider();
    const controller = new AbortController();
    const request = provider.translateBatch({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      inputs: ['Hello'],
      abortSignal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ code: 'request_cancelled', retryable: false });
  });

  it('classifies provider timeouts as retryable', async () => {
    vi.stubEnv('OPENAI_TIMEOUT_MS', '1');
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    ));
    const provider = await loadProvider();

    await expect(provider.translateBatch({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      inputs: ['Hello'],
    })).rejects.toMatchObject({ code: 'provider_timeout', retryable: true });
  });
});
