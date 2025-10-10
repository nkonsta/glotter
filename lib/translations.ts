import { supabase, TranslationRow } from './supabase';

/**
 * Fetch all translations for a project in grid format
 * Returns translation keys as rows with languages as columns
 */
export async function getTranslationsGrid(projectId: string): Promise<TranslationRow[]> {
  // First, get all languages for this project
  const { data: languages, error: langError } = await supabase
    .from('project_languages')
    .select('id, language_code, language_name')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('language_code');

  if (langError) throw langError;
  if (!languages) return [];

  // Get all translation keys with their translations using a single query with embedding
  const { data: keys, error: keysError } = await supabase
    .from('translation_keys')
    .select('id, key, translations(id, project_language_id, value)')
    .eq('project_id', projectId)
    .order('key');

  if (keysError) throw keysError;
  if (!keys) return [];

  // Build the grid structure
  const rows: TranslationRow[] = keys.map(key => {
    const translationsMap: Record<string, { value: string | null; translation_id: string; language_id: string }> = {};

    languages.forEach(lang => {
      const translation = key.translations?.find(
        (t: { id: string; project_language_id: string; value: string | null }) => t.project_language_id === lang.id
      );

      translationsMap[lang.language_code] = {
        value: translation?.value || null,
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

/**
 * Update a translation value
 */
export async function updateTranslation(
  translationId: string,
  value: string
): Promise<void> {
  const { error } = await supabase
    .from('translations')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('id', translationId);

  if (error) throw error;
}

/**
 * Create a new translation (when cell was previously empty)
 */
export async function createTranslation(
  keyId: string,
  projectLanguageId: string,
  value: string
): Promise<void> {
  const { error } = await supabase
    .from('translations')
    .insert({ key_id: keyId, project_language_id: projectLanguageId, value });

  if (error) throw error;
}

/**
 * Create a new translation key for a project
 */
export async function createTranslationKey(projectId: string, key: string): Promise<{ id: string; key: string }> {
  const { data, error } = await supabase
    .from('translation_keys')
    .insert({ project_id: projectId, key })
    .select('id, key')
    .single();

  if (error) throw error;
  return data as { id: string; key: string };
}

/**
 * Get all projects
 */
export async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Get languages for a project
 */
export async function getProjectLanguages(projectId: string) {
  const { data, error } = await supabase
    .from('project_languages')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('language_code');

  if (error) throw error;
  return data || [];
}
