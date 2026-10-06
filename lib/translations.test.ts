import { describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from } }));

import { getTranslationsGrid } from './translations';

describe('translation export rows', () => {
  it('loads every page with exact dotted keys and preserves empty strings', async () => {
    const keys = Array.from({ length: 1774 }, (_, index) => ({
      id: `key-${index}`,
      key: index === 0 ? 'settings.sosButton' : index === 1 ? 'settings.sosButton.back' : `key.${index}`,
      translations: [{ id: `translation-${index}`, project_language_id: 'lang-en', value: index === 0 ? '' : `Value ${index}` }],
    }));
    const ranges: number[] = [];
    from.mockImplementation(table => {
      let start = 0;
      let end = 0;
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        range: vi.fn((first: number, last: number) => {
          start = first;
          end = last;
          ranges.push(first);
          return query;
        }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({
          error: null,
          data: table === 'project_languages'
            ? [{ id: 'lang-en', language_code: 'en', language_name: 'English' }]
            : keys.slice(start, end + 1),
        }).then(resolve),
      };
      return query;
    });
    const rows = await getTranslationsGrid('project', ['en']);
    expect(ranges).toEqual([0, 1000]);
    expect(rows).toHaveLength(1774);
    expect(rows[0].key).toBe('settings.sosButton');
    expect(rows[0].translations.en.value).toBe('');
    expect(rows[1].key).toBe('settings.sosButton.back');
    expect(rows[1773].translations.en.value).toBe('Value 1773');
  });
});
