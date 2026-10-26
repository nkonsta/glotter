import type { SupabaseClient } from '@supabase/supabase-js';
import type { TranslationRow } from './supabase';

interface ProjectLanguageRecord {
  id: string;
  language_code: string;
  language_name: string | null;
}

interface TranslationRecord {
  id: string;
  project_language_id: string;
  value: string | null;
}

interface TranslationKeyRecord {
  id: string;
  key: string;
  translations?: TranslationRecord[];
}

/**
 * Fetch translations for a project in grid format with the given client.
 * Shared by the browser data layer and server-side export routes.
 * Optionally filters to a subset of language codes to reduce payload.
 */
export async function fetchTranslationsGrid(
  client: SupabaseClient,
  projectId: string,
  languageCodes?: string[],
  onProgress?: (loaded: number) => void
): Promise<TranslationRow[]> {
  // First, get languages for this project (optionally filtered)
  let langsQuery = client
    .from('project_languages')
    .select('id, language_code, language_name')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('language_code');

  if (Array.isArray(languageCodes) && languageCodes.length > 0) {
    langsQuery = langsQuery.in('language_code', languageCodes);
  }

  const { data: languagesData, error: langError } = await langsQuery;

  if (langError) throw langError;
  const languages = (languagesData ?? []) as ProjectLanguageRecord[];
  if (languages.length === 0) return [];

  const languageIds = languages.map(lang => lang.id);

  // Paginate translation keys to bypass Supabase/PostgREST's default 1000-row cap
  const PAGE_SIZE = 1000;
  const keys: TranslationKeyRecord[] = [];
  let from = 0;

  while (true) {
    let keysQuery = client
      .from('translation_keys')
      .select('id, key, translations(id, project_language_id, value)')
      .eq('project_id', projectId)
      .order('key')
      .range(from, from + PAGE_SIZE - 1);

    if (languageIds.length > 0) {
      keysQuery = keysQuery.in('translations.project_language_id', languageIds);
    }

    const { data: keysData, error: keysError } = await keysQuery;
    if (keysError) throw keysError;
    const page = (keysData ?? []) as TranslationKeyRecord[];
    keys.push(...page);
    onProgress?.(keys.length);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (keys.length === 0) return [];

  // Build the grid structure
  const rows: TranslationRow[] = keys.map(key => {
    const translationsMap: Record<string, { value: string | null; translation_id: string; language_id: string }> = {};

    languages.forEach(lang => {
      const translation = key.translations?.find(
        (t) => t.project_language_id === lang.id
      );

      translationsMap[lang.language_code] = {
        value: translation?.value ?? null,
        translation_id: translation?.id || '',
        language_id: lang.id
      };
    });

    return {
      key: key.key,
      key_id: key.id,
      translations: translationsMap
    };
  });

  return rows;
}
