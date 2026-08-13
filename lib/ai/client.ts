import type {
  AiErrorResponseBody,
  AiSuggestedTranslation,
  AiTranslateEntry,
  AiTranslateRequestBody,
  AiTranslateResponseBody,
  AiTranslationFailure,
} from './types';
import type { AiErrorCode } from './errors';

export class AiTranslateApiError extends Error {
  readonly code: AiErrorCode;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(body: AiErrorResponseBody['error']) {
    super(body.message);
    this.name = 'AiTranslateApiError';
    this.code = body.code;
    this.requestId = body.requestId;
    this.retryable = body.retryable;
    this.retryAfterSeconds = body.retryAfterSeconds;
  }
}

function isErrorResponse(value: unknown): value is AiErrorResponseBody {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === 'object' && error !== null && !Array.isArray(error)
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { message?: unknown }).message === 'string'
    && typeof (error as { requestId?: unknown }).requestId === 'string'
    && typeof (error as { retryable?: unknown }).retryable === 'boolean';
}

export async function requestAiTranslations(
  body: AiTranslateRequestBody,
  accessToken: string,
  signal?: AbortSignal,
): Promise<AiTranslateResponseBody> {
  const response = await fetch('/api/ai-translate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isErrorResponse(payload)) throw new AiTranslateApiError(payload.error);
    throw new Error('AI translation failed.');
  }
  return payload as AiTranslateResponseBody;
}

function upsertSuggestion(
  aggregate: Record<string, AiSuggestedTranslation[]>,
  targetLanguage: string,
  suggestion: AiSuggestedTranslation,
) {
  const items = aggregate[targetLanguage] ?? [];
  const index = items.findIndex(item => item.key === suggestion.key);
  if (index >= 0) {
    items[index] = suggestion;
  } else {
    items.push(suggestion);
  }
  aggregate[targetLanguage] = items;
}

export function mergeAiResponse(
  aggregate: Record<string, AiSuggestedTranslation[]>,
  response: AiTranslateResponseBody,
  entries: AiTranslateEntry[],
): number {
  Object.entries(response.translations).forEach(([language, suggestions]) => {
    suggestions.forEach(suggestion => upsertSuggestion(aggregate, language, suggestion));
  });
  response.failures.forEach(failure => appendAiFailure(aggregate, entries, failure));
  return response.failures.reduce((count, failure) => count + failure.keys.length, 0);
}

export function appendAiFailure(
  aggregate: Record<string, AiSuggestedTranslation[]>,
  entries: AiTranslateEntry[],
  failure: AiTranslationFailure,
) {
  const keys = new Set(failure.keys);
  entries.filter(entry => keys.has(entry.key)).forEach(entry => {
    upsertSuggestion(aggregate, failure.targetLanguage, {
      key: entry.key,
      text: entry.text,
      aiText: '',
      changed: false,
      error: failure.message,
    });
  });
}

export function appendAiRequestFailure(
  aggregate: Record<string, AiSuggestedTranslation[]>,
  entries: AiTranslateEntry[],
  targetLanguages: string[],
  error: Pick<AiTranslateApiError, 'code' | 'message' | 'retryable'>,
) {
  targetLanguages.forEach(targetLanguage => appendAiFailure(aggregate, entries, {
    targetLanguage,
    keys: entries.map(entry => entry.key),
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  }));
}
