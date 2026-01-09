import { supabase, TranslationRow, Project, ProjectLanguage } from './supabase';

export type ProjectRole = 'owner' | 'member';

export interface ProjectMembership {
  role: ProjectRole;
  viewLanguages: string[] | null;
  editLanguages: string[] | null;
}

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
 * Fetch translations for a project in grid format.
 * Optionally filters to a subset of language codes to reduce payload.
 */
export async function getTranslationsGrid(projectId: string, languageCodes?: string[]): Promise<TranslationRow[]> {
  // First, get languages for this project (optionally filtered)
  let langsQuery = supabase
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

  // Get translation keys with their translations using a single query with embedding
  let keysQuery = supabase
    .from('translation_keys')
    .select('id, key, translations(id, project_language_id, value)')
    .eq('project_id', projectId)
    .order('key');

  if (languageIds.length > 0) {
    keysQuery = keysQuery.in('translations.project_language_id', languageIds);
  }

  const { data: keysData, error: keysError } = await keysQuery;
  if (keysError) throw keysError;
  const keys = (keysData ?? []) as TranslationKeyRecord[];
  if (keys.length === 0) return [];

  // Build the grid structure
  const rows: TranslationRow[] = keys.map(key => {
    const translationsMap: Record<string, { value: string | null; translation_id: string; language_id: string }> = {};

    languages.forEach(lang => {
      const translation = key.translations?.find(
        (t) => t.project_language_id === lang.id
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
export interface SaveTranslationArgs {
  projectId: string;
  keyId: string;
  projectLanguageId: string;
  languageCode: string;
  value: string;
  translationId?: string | null;
}

async function callTranslationSave(args: SaveTranslationArgs): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Not authenticated. Please sign in again.');
  }

  const response = await fetch('/api/translations/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(args),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && payload !== null && 'error' in payload
      ? String((payload as { error?: unknown }).error ?? 'Failed to save translation.')
      : 'Failed to save translation.';
    throw new Error(message);
  }

  const translationId = payload && typeof payload === 'object' && payload !== null && 'translationId' in payload
    ? (payload as { translationId?: unknown }).translationId
    : null;

  if (typeof translationId !== 'string' || !translationId) {
    throw new Error('Translation save did not return an identifier.');
  }

  return translationId;
}

export async function updateTranslation(args: SaveTranslationArgs & { translationId: string }): Promise<string> {
  return callTranslationSave(args);
}

/**
 * Create a new translation (when cell was previously empty)
 */
export async function createTranslation(args: SaveTranslationArgs): Promise<string> {
  return callTranslationSave(args);
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
export async function getProjectLanguages(projectId: string): Promise<ProjectLanguage[]> {
  const { data, error } = await supabase
    .from('project_languages')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('language_code');

  if (error) throw error;
  return (data ?? []) as ProjectLanguage[];
}

/**
 * Fetch the current user's role for a project.
 */
export async function getProjectMembership(projectId: string): Promise<ProjectMembership | null> {
  const { data, error } = await supabase
    .from('project_members')
    .select('role, view_languages, edit_languages')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116' || error.code === 'PGRST103' || error.code === 'PGRST104') {
      return null;
    }
    throw error;
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const { role, view_languages: viewLanguages, edit_languages: editLanguages } = data as {
    role?: string | null;
    view_languages?: string[] | null;
    edit_languages?: string[] | null;
  };

  if (role !== 'owner' && role !== 'member') {
    return null;
  }

  return {
    role,
    viewLanguages: Array.isArray(viewLanguages) ? viewLanguages : null,
    editLanguages: Array.isArray(editLanguages) ? editLanguages : null,
  };
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
  const { data, error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('Unable to delete project. You may need owner access to perform this action.');
  }
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

/**
 * Bulk: ensure language codes exist and return code -> id map
 */
export async function getLanguageCodeToIdMap(projectId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('project_languages')
    .select('id, language_code')
    .eq('project_id', projectId)
    .eq('is_active', true);
  if (error) throw error;
  const map: Record<string, string> = {};
  const rows = (data ?? []) as Array<{ id: string; language_code: string }>;
  rows.forEach((row) => {
    map[row.language_code] = row.id;
  });
  return map;
}

/**
 * Bulk upsert translation keys by string value
 */
export async function bulkUpsertKeys(projectId: string, keys: string[]): Promise<void> {
  const uniqueKeys = Array.from(new Set(keys)).filter(k => !!k);
  if (uniqueKeys.length === 0) return;
  const rows = uniqueKeys.map(k => ({ project_id: projectId, key: k }));
  const { error } = await supabase
    .from('translation_keys')
    .upsert(rows, { onConflict: 'project_id,key' });
  if (error) throw error;
}

/**
 * Return key string -> id map for a project
 */
export async function getKeyToIdMap(projectId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('translation_keys')
    .select('id, key')
    .eq('project_id', projectId);
  if (error) throw error;
  const map: Record<string, string> = {};
  const rows = (data ?? []) as Array<{ id: string; key: string }>;
  rows.forEach((row) => { map[row.key] = row.id; });
  return map;
}

/**
 * Bulk upsert translations for provided key/lang/value triples
 */
export async function bulkUpsertTranslations(
  projectId: string,
  entries: Array<{ key: string; langCode: string; value: string | null }>,
  chunkSize: number = 1000
): Promise<number> {
  if (entries.length === 0) return 0;

  // Ensure keys exist
  await bulkUpsertKeys(projectId, entries.map(e => e.key));

  // Resolve ids
  const [keyToId, codeToId] = await Promise.all([
    getKeyToIdMap(projectId),
    getLanguageCodeToIdMap(projectId),
  ]);

  const rows = entries
    .filter(e => keyToId[e.key] && codeToId[e.langCode])
    .map(e => ({
      key_id: keyToId[e.key],
      project_language_id: codeToId[e.langCode],
      value: e.value,
    }));

  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('translations')
      .upsert(chunk, { onConflict: 'key_id,project_language_id' });
    if (error) throw error;
    total += chunk.length;
  }
  return total;
}

/**
 * Delete translations for a language where keys are NOT in keepKeys
 * Useful for destructive "delete missing" imports.
 */
export async function deleteMissingTranslations(
  projectId: string,
  langCode: string,
  keepKeys: string[],
  chunkSize: number = 1000
): Promise<number> {
  // Resolve language id
  const { data: langRow, error: langErr } = await supabase
    .from('project_languages')
    .select('id')
    .eq('project_id', projectId)
    .eq('language_code', (langCode || '').toLowerCase())
    .single();
  if (langErr) throw langErr;
  if (!langRow) return 0;

  // Get key ids to keep
  const { data: keyRows, error: keyErr } = await supabase
    .from('translation_keys')
    .select('id, key')
    .eq('project_id', projectId);
  if (keyErr) throw keyErr;
  const keepSet = new Set(keepKeys);
  const keyRecords = (keyRows ?? []) as Array<{ id: string; key: string }>;
  const toDeleteKeyIds = keyRecords
    .filter(k => !keepSet.has(k.key))
    .map(k => k.id);
  if (toDeleteKeyIds.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < toDeleteKeyIds.length; i += chunkSize) {
    const ids = toDeleteKeyIds.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('translations')
      .delete()
      .eq('project_language_id', langRow.id)
      .in('key_id', ids);
    if (error) throw error;
    total += ids.length;
  }
  return total;
}
