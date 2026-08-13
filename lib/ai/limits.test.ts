import { describe, expect, it } from 'vitest';
import {
  AI_MAX_TARGET_LANGUAGES_PER_REQUEST,
  AI_MAX_TOTAL_SOURCE_CHARACTERS,
  chunkAiEntries,
  chunkAiTargetLanguages,
} from './limits';

describe('AI request chunking', () => {
  it('splits entries at the requested count boundary', () => {
    const chunks = chunkAiEntries([
      { text: 'one' },
      { text: 'two' },
      { text: 'three' },
    ], 2);
    expect(chunks.map(chunk => chunk.length)).toEqual([2, 1]);
  });

  it('splits before exceeding the total character boundary', () => {
    const chunks = chunkAiEntries([
      { text: 'a'.repeat(AI_MAX_TOTAL_SOURCE_CHARACTERS - 1) },
      { text: 'bb' },
    ], 100);
    expect(chunks.map(chunk => chunk.length)).toEqual([1, 1]);
  });

  it('splits target languages at the server boundary', () => {
    const languages = Array.from(
      { length: AI_MAX_TARGET_LANGUAGES_PER_REQUEST + 1 },
      (_, index) => `l${index}`
    );
    expect(chunkAiTargetLanguages(languages).map(chunk => chunk.length)).toEqual([
      AI_MAX_TARGET_LANGUAGES_PER_REQUEST,
      1,
    ]);
  });
});
