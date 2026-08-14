import { describe, expect, it } from 'vitest';
import { estimateAiTranslationWork } from './usageWork';

describe('estimateAiTranslationWork', () => {
  it('counts source text once for every target language', () => {
    expect(estimateAiTranslationWork({
      sourceCharacters: 120,
      glossaryCharacters: 0,
      targetLanguageCount: 3,
      batchCount: 2,
    })).toBe(360);
  });

  it('counts glossary text for every target and provider batch', () => {
    expect(estimateAiTranslationWork({
      sourceCharacters: 1,
      glossaryCharacters: 50_000,
      targetLanguageCount: 2,
      batchCount: 3,
    })).toBe(300_002);
  });
});
