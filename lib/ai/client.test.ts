import { describe, expect, it } from 'vitest';
import { appendAiRequestFailure, mergeAiResponse } from './client';
import type { AiSuggestedTranslation, AiTranslateEntry } from './types';

const entries: AiTranslateEntry[] = [
  { key: 'welcome', text: 'Welcome' },
  { key: 'goodbye', text: 'Goodbye' },
];

describe('AI client aggregation', () => {
  it('preserves successful suggestions and adds failed entries to the same preview', () => {
    const aggregate: Record<string, AiSuggestedTranslation[]> = {};
    const failureCount = mergeAiResponse(aggregate, {
      requestId: 'request-1',
      translations: {
        fr: [{ key: 'welcome', text: 'Welcome', aiText: 'Bienvenue', changed: true }],
      },
      failures: [{
        targetLanguage: 'fr',
        keys: ['goodbye'],
        code: 'provider_timeout',
        message: 'The translation provider timed out.',
        retryable: true,
      }],
    }, entries);

    expect(failureCount).toBe(1);
    expect(aggregate.fr).toEqual([
      { key: 'welcome', text: 'Welcome', aiText: 'Bienvenue', changed: true },
      {
        key: 'goodbye',
        text: 'Goodbye',
        aiText: '',
        changed: false,
        error: 'The translation provider timed out.',
      },
    ]);
  });

  it('marks remaining client chunks failed without overwriting completed entries', () => {
    const aggregate: Record<string, AiSuggestedTranslation[]> = {
      fr: [{ key: 'welcome', text: 'Welcome', aiText: 'Bienvenue', changed: true }],
    };
    appendAiRequestFailure(aggregate, [entries[1]], ['fr', 'de'], {
      code: 'provider_rate_limit',
      message: 'Please try again shortly.',
      retryable: true,
    });

    expect(aggregate.fr[0].aiText).toBe('Bienvenue');
    expect(aggregate.fr[1].error).toBe('Please try again shortly.');
    expect(aggregate.de[0].key).toBe('goodbye');
  });
});
