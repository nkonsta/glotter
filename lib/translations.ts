import { supabase, TranslationRow, Project, ProjectLanguage } from './supabase';

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
 * Rename an existing translation key
 */
export async function renameTranslationKey(
  keyId: string,
  newKey: string
): Promise<void> {
  const { error } = await supabase
    .from('translation_keys')
    .update({ key: newKey })
    .eq('id', keyId);

  if (error) throw error;
}

/**
 * Delete translation keys by id (cascades to translations via FK)
 */
export async function deleteTranslationKeys(
  keyIds: string[]
): Promise<void> {
  if (keyIds.length === 0) return;
  const { error } = await supabase
    .from('translation_keys')
    .delete()
    .in('id', keyIds);

  if (error) throw error;
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

/**
 * Create a new project and optionally initialize languages
 */
export async function createProject(
  name: string,
  initialLanguages?: Array<{ code: string; name?: string }>
): Promise<Project> {
  // Create project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({ name })
    .select('*')
    .single();

  if (projectError) throw projectError;
  const created = project as Project;

  // Initialize languages (default to 'en' if none provided)
  const languagesToInsert = (initialLanguages && initialLanguages.length > 0)
    ? initialLanguages
    : [{ code: 'en', name: 'English' }];

  const insertRows = languagesToInsert.map(l => ({
    project_id: created.id,
    language_code: (l.code || '').toLowerCase(),
    language_name: l.name ?? null,
    is_active: true,
  }));

  const { error: langError } = await supabase
    .from('project_languages')
    .upsert(insertRows, { onConflict: 'project_id,language_code' });

  if (langError) throw langError;

  return created;
}

/**
 * Delete a project (cascades via FK constraints)
 */
export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) throw error;
}

/**
 * Add or activate a language for a project
 */
export async function addLanguage(
  projectId: string,
  code: string,
  name?: string
): Promise<ProjectLanguage> {
  const { data, error } = await supabase
    .from('project_languages')
    .upsert(
      [{ project_id: projectId, language_code: (code || '').toLowerCase(), language_name: name ?? null, is_active: true }],
      { onConflict: 'project_id,language_code' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as ProjectLanguage;
}

/**
 * Delete a language from a project (cascades translations via FK)
 */
export async function deleteLanguage(
  projectId: string,
  code: string
): Promise<void> {
  // Find language row id to ensure scoped delete
  const { data: langRow, error: findError } = await supabase
    .from('project_languages')
    .select('id')
    .eq('project_id', projectId)
    .eq('language_code', code)
    .single();

  if (findError) throw findError;
  if (!langRow) return;

  const { error } = await supabase
    .from('project_languages')
    .delete()
    .eq('id', langRow.id);

  if (error) throw error;
}

/**
 * Update a language's display name for a project
 */
export async function updateLanguageName(
  projectId: string,
  code: string,
  name: string | null
): Promise<void> {
  const { data: langRow, error: findError } = await supabase
    .from('project_languages')
    .select('id')
    .eq('project_id', projectId)
    .eq('language_code', (code || '').toLowerCase())
    .single();
  if (findError) throw findError;
  if (!langRow) return;

  const { error } = await supabase
    .from('project_languages')
    .update({ language_name: name })
    .eq('id', langRow.id);
  if (error) throw error;
}
