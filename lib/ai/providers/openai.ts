import type { AiGlossaryTerm, AiProvider } from '../types';
import { AiProviderError, toAiProviderError } from '../errors';
import { logAi } from '../logging';
import { protectPlaceholders, restorePlaceholders } from '../placeholders';

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.GPT_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_COMPLETION_TOKENS = 24000;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } | null }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

type OpenAiCallResult = {
  content: string;
  providerRequestId?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildSystemPrompt(targetLang: string, glossary?: AiGlossaryTerm[]): string {
  const glossaryLines = glossary && glossary.length > 0
    ? `\nGlossary (authoritative, never deviate):\n${glossary.map(term => `${term.source} => ${term.target}`).join('\n')}`
    : '';
  return [
    `You are a professional translator. Translate the user's text into ${targetLang}.`,
    'Requirements:',
    '- Preserve placeholders exactly (e.g., {name}, %s, ICU plural/select blocks).',
    '- Do not add or remove placeholders.',
    '- Maintain tone and punctuation. Keep short, natural strings for UI.',
    glossaryLines,
  ].join('\n');
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function classifyHttpError(response: Response): AiProviderError {
  const providerRequestId = response.headers.get('x-request-id') || undefined;
  const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
  const options = { status: response.status, providerRequestId, retryAfterSeconds };

  if (response.status === 401 || response.status === 403) {
    return new AiProviderError(
      'provider_authentication',
      'The translation provider is not configured correctly.',
      options
    );
  }
  if (response.status === 408) {
    return new AiProviderError(
      'provider_timeout',
      'The translation provider timed out.',
      { ...options, retryable: true }
    );
  }
  if (response.status === 429) {
    return new AiProviderError(
      'provider_rate_limit',
      'The translation provider is busy. Please try again shortly.',
      { ...options, retryable: true }
    );
  }
  if (response.status >= 500) {
    return new AiProviderError(
      'provider_unavailable',
      'The translation provider is temporarily unavailable.',
      { ...options, retryable: true }
    );
  }
  return new AiProviderError(
    'provider_rejected_request',
    'The translation provider rejected the request.',
    options
  );
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AiProviderError('request_cancelled', 'Translation was cancelled.'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiProviderError('request_cancelled', 'Translation was cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function callOpenAI(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  model: string,
  requestId: string,
  abortSignal?: AbortSignal,
): Promise<OpenAiCallResult> {
  if (!OPENAI_API_KEY) {
    throw new AiProviderError(
      'provider_authentication',
      'The translation provider is not configured correctly.'
    );
  }

  const timeoutMs = positiveInteger(process.env.OPENAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxRetries = nonNegativeInteger(process.env.AI_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const maxCompletionTokens = positiveInteger(
    process.env.OPENAI_MAX_COMPLETION_TOKENS,
    DEFAULT_MAX_COMPLETION_TOKENS
  );

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (abortSignal?.aborted) {
      throw new AiProviderError('request_cancelled', 'Translation was cancelled.');
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort(abortSignal?.reason);
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      logAi('info', 'provider_request_started', {
        request_id: requestId,
        attempt,
        model,
        message_count: messages.length,
      });
      const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Client-Request-Id': `${requestId}-${attempt}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxCompletionTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'translation_batch',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  translations: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                required: ['translations'],
                additionalProperties: false,
              },
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw classifyHttpError(response);

      const json = (await response.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new AiProviderError(
          'provider_malformed_output',
          'The translation provider returned an invalid response.',
          { providerRequestId: response.headers.get('x-request-id') || undefined }
        );
      }

      const result = {
        content: content.trim(),
        providerRequestId: response.headers.get('x-request-id') || undefined,
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
          totalTokens: json.usage?.total_tokens ?? 0,
        },
      };
      logAi('info', 'provider_request_succeeded', {
        request_id: requestId,
        provider_request_id: result.providerRequestId,
        attempt,
        model,
        duration_ms: Date.now() - startedAt,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens,
      });
      return result;
    } catch (error: unknown) {
      let providerError: AiProviderError;
      if (abortSignal?.aborted) {
        providerError = new AiProviderError('request_cancelled', 'Translation was cancelled.');
      } else if (timedOut) {
        providerError = new AiProviderError(
          'provider_timeout',
          'The translation provider timed out.',
          { retryable: true, cause: error }
        );
      } else {
        providerError = toAiProviderError(error);
      }

      logAi(providerError.retryable ? 'warn' : 'error', 'provider_request_failed', {
        request_id: requestId,
        provider_request_id: providerError.providerRequestId,
        attempt,
        model,
        duration_ms: Date.now() - startedAt,
        error_code: providerError.code,
        provider_status: providerError.status,
        retryable: providerError.retryable,
      });

      if (!providerError.retryable || attempt >= maxRetries) throw providerError;
      const backoffMs = providerError.retryAfterSeconds !== undefined
        ? providerError.retryAfterSeconds * 1000
        : Math.min(8000, 1000 * (2 ** attempt)) + Math.floor(Math.random() * 250);
      await abortableSleep(backoffMs, abortSignal);
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
    }
  }

  throw new AiProviderError(
    'provider_unavailable',
    'The translation provider is temporarily unavailable.',
    { retryable: true }
  );
}

export class OpenAiProvider implements AiProvider {
  private readonly model: string;

  constructor(model: string = OPENAI_MODEL) {
    this.model = model;
  }

  async translateBatch(params: {
    sourceLanguage: string;
    targetLanguage: string;
    inputs: string[];
    glossary?: AiGlossaryTerm[];
    abortSignal?: AbortSignal;
  }) {
    const { targetLanguage, inputs, glossary, abortSignal } = params;
    const requestId = `provider-${crypto.randomUUID()}`;
    const protectedItems = inputs.map(protectPlaceholders);
    const payload = protectedItems.map(item => item.textWithSentinels);
    const user = [
      'Translate each item in the JSON array below into the target language.',
      'Return an object with a translations array in the same length and order.',
      'Keep sentinels like __PH_1__ unchanged. Do not alter the count or order of items.',
      'INPUTS:',
      JSON.stringify(payload),
    ].join('\n');

    const result = await callOpenAI([
      { role: 'system', content: buildSystemPrompt(targetLanguage, glossary) },
      { role: 'user', content: user },
    ], this.model, requestId, abortSignal);

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content);
    } catch (error) {
      throw new AiProviderError(
        'provider_malformed_output',
        'The translation provider returned an invalid response.',
        { providerRequestId: result.providerRequestId, cause: error }
      );
    }

    const translations = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as { translations?: unknown }).translations
      : undefined;
    if (
      !Array.isArray(translations) ||
      translations.length !== inputs.length ||
      translations.some(value => typeof value !== 'string')
    ) {
      throw new AiProviderError(
        'provider_malformed_output',
        'The translation provider returned an invalid response.',
        { providerRequestId: result.providerRequestId }
      );
    }

    return {
      outputs: translations.map((text, index) =>
        restorePlaceholders(text, protectedItems[index].mapping)
      ),
      providerRequestId: result.providerRequestId,
      usage: result.usage,
    };
  }
}
