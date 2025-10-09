'use client';

import { useEffect, useState } from 'react';
import { getProjects, getProjectLanguages, getTranslationsGrid } from '@/lib/translations';
import { TranslationRow } from '@/lib/supabase';
import TranslationGrid from '@/components/TranslationGrid';

interface Project {
  id: string;
  name: string;
}

interface Language {
  code: string;
  name: string | null;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [languages, setLanguages] = useState<Language[]>([]);
  const [translations, setTranslations] = useState<TranslationRow[]>([]);
  const [filteredTranslations, setFilteredTranslations] = useState<TranslationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'complete'>('all');
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [visibleLanguages, setVisibleLanguages] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectData(selectedProject);
    }
  }, [selectedProject]);

  useEffect(() => {
    applyFilters();
  }, [translations, searchQuery, filterMode, languages]);

  useEffect(() => {
    // Initialize all languages as visible when languages change
    setVisibleLanguages(new Set(languages.map(l => l.code)));
  }, [languages]);

  function applyFilters() {
    let filtered = translations;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(row =>
        row.key.toLowerCase().includes(query) ||
        Object.values(row.translations).some(t =>
          t.value?.toLowerCase().includes(query)
        )
      );
    }

    // Apply missing/complete filter
    if (filterMode === 'missing') {
      filtered = filtered.filter(row =>
        Object.values(row.translations).some(t => !t.value)
      );
    } else if (filterMode === 'complete') {
      filtered = filtered.filter(row =>
        Object.values(row.translations).every(t => t.value)
      );
    }

    setFilteredTranslations(filtered);
  }

  async function loadProjects() {
    try {
      const data = await getProjects();
      setProjects(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load projects. Check your Supabase configuration.');
      setLoading(false);
      console.error(err);
    }
  }

  async function loadProjectData(projectId: string) {
    try {
      setLoading(true);
      const [langs, trans] = await Promise.all([
        getProjectLanguages(projectId),
        getTranslationsGrid(projectId)
      ]);

      setLanguages(langs.map(l => ({ code: l.language_code, name: l.language_name })));
      setTranslations(trans);
      setLoading(false);
    } catch (err) {
      setError('Failed to load project data');
      setLoading(false);
      console.error(err);
    }
  }

  function exportLanguage(langCode: string) {
    const languageTranslations = translations.reduce((acc, row) => {
      const translation = row.translations[langCode];
      if (translation?.value) {
        acc[row.key] = translation.value;
      }
      return acc;
    }, {} as Record<string, string>);

    const blob = new Blob([JSON.stringify(languageTranslations, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${langCode}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAllLanguages() {
    const allExports: Record<string, Record<string, string>> = {};

    languages.forEach(lang => {
      allExports[lang.code] = translations.reduce((acc, row) => {
        const translation = row.translations[lang.code];
        if (translation?.value) {
          acc[row.key] = translation.value;
        }
        return acc;
      }, {} as Record<string, string>);
    });

    const blob = new Blob([JSON.stringify(allExports, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all-languages-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            Make sure you've added your Supabase credentials to .env.local:
          </p>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto">
            NEXT_PUBLIC_SUPABASE_URL=your-url{'\n'}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Glotter</h1>
            {projects.length > 0 && selectedProject && (
              <>
                <div className="w-px h-4 bg-gray-300"></div>
                <div className="relative">
                  <button
                    onClick={() => setShowProjectMenu(!showProjectMenu)}
                    className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-transparent hover:bg-gray-50 rounded-md focus:outline-none focus:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                  >
                    <span>{projects.find(p => p.id === selectedProject)?.name}</span>
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showProjectMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setShowProjectMenu(false)}
                      />
                      <div className="absolute left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-40">
                        {projects.map((project) => (
                          <button
                            key={project.id}
                            onClick={() => {
                              setSelectedProject(project.id);
                              setShowProjectMenu(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              project.id === selectedProject
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {project.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          {projects.length > 0 && !selectedProject && (
            <div className="relative">
              <button
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium text-gray-500"
              >
                <span>Select a project...</span>
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showProjectMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowProjectMenu(false)}
                  />
                  <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-40">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          setSelectedProject(project.id);
                          setShowProjectMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm transition-colors text-gray-700 hover:bg-gray-50"
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              <div className="text-muted font-medium">Loading translations...</div>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white p-12 rounded-xl shadow-card text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">No Projects Found</h2>
            <p className="text-muted">
              Create a project in your Supabase database to get started.
            </p>
          </div>
        ) : !selectedProject ? (
          <div className="bg-white p-12 rounded-xl shadow-card text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Select a Project</h2>
            <p className="text-muted">
              Choose a project from the dropdown above to view and manage translations.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white px-6 py-6 rounded-xl shadow-card">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-6">
                  <div className="text-sm font-medium text-gray-700">
                    <span className="text-lg font-bold text-gray-900">{translations.length}</span>
                    <span className="ml-1.5 text-muted">keys</span>
                  </div>
                  <div className="h-6 w-px bg-gray-200"></div>
                  <div className="text-sm font-medium text-gray-700">
                    <span className="text-lg font-bold text-gray-900">{languages.length}</span>
                    <span className="ml-1.5 text-muted">languages</span>
                  </div>
                  {filterMode !== 'all' && (
                    <>
                      <div className="h-6 w-px bg-gray-200"></div>
                      <div className="text-sm font-medium text-gray-700">
                        <span className="text-lg font-bold text-warning">{filteredTranslations.length}</span>
                        <span className="ml-1.5 text-muted">filtered</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors duration-150 font-medium text-sm text-gray-700 flex items-center gap-2"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Export
                    </button>

                    {showExportMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setShowExportMenu(false)}
                        />
                        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-card border border-gray-200 py-2 z-40">
                          <div className="px-4 py-2 text-xs font-medium text-muted uppercase tracking-wide border-b">
                            Export Translations
                          </div>
                          <button
                            onClick={() => {
                              exportAllLanguages();
                              setShowExportMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-surface transition-colors text-sm text-gray-900 font-medium flex items-center gap-2"
                          >
                            <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                            All Languages (JSON)
                          </button>
                          <div className="border-t my-2"></div>
                          <div className="px-4 py-1 text-xs font-medium text-muted">
                            Individual Languages:
                          </div>
                          {languages.map(lang => (
                            <button
                              key={lang.code}
                              onClick={() => {
                                exportLanguage(lang.code);
                                setShowExportMenu(false);
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-surface transition-colors text-sm text-gray-700 flex items-center justify-between"
                            >
                              <span>
                                <span className="font-medium">{lang.code.toUpperCase()}</span>
                                {lang.name && <span className="text-xs text-muted ml-2">({lang.name})</span>}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button className="px-4 py-2 bg-primary text-white rounded-lg shadow-sm hover:bg-primary-600 transition-colors duration-150 font-medium text-sm">
                    + Add New Key
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <input
                    type="search"
                    aria-label="Search translations"
                    placeholder="Search translation keys or values..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:border-primary transition-all text-sm"
                  />
                  <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1 rounded-md border text-sm font-medium transition-colors duration-150 ${
                      filterMode === 'all'
                        ? 'border-gray-300 bg-gray-900 text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilterMode('missing')}
                    className={`px-3 py-1 rounded-md border text-sm font-medium transition-colors duration-150 ${
                      filterMode === 'missing'
                        ? 'border-warning bg-warning text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Missing
                  </button>
                  <button
                    onClick={() => setFilterMode('complete')}
                    className={`px-3 py-1 rounded-md border text-sm font-medium transition-colors duration-150 ${
                      filterMode === 'complete'
                        ? 'border-success bg-success text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Complete
                  </button>

                  {languages.length > 0 && (
                    <div className="relative ml-2">
                      <button
                        onClick={() => setShowColumnMenu(!showColumnMenu)}
                        className="px-3 py-1 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-150 flex items-center gap-2"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                        </svg>
                        Columns
                      </button>

                      {showColumnMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setShowColumnMenu(false)}
                          />
                          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-card border border-gray-200 py-2 z-40">
                            <div className="px-4 py-2 text-xs font-medium text-muted uppercase tracking-wide border-b">
                              Show/Hide Languages
                            </div>
                            {languages.map(lang => (
                              <label
                                key={lang.code}
                                className="flex items-center gap-3 px-4 py-2 hover:bg-surface cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={visibleLanguages.has(lang.code)}
                                  onChange={() => {
                                    const newVisible = new Set(visibleLanguages);
                                    if (newVisible.has(lang.code)) {
                                      newVisible.delete(lang.code);
                                    } else {
                                      newVisible.add(lang.code);
                                    }
                                    setVisibleLanguages(newVisible);
                                  }}
                                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary"
                                />
                                <span className="text-sm text-gray-900 font-medium">
                                  {lang.code.toUpperCase()}
                                </span>
                                {lang.name && (
                                  <span className="text-xs text-muted ml-auto">{lang.name}</span>
                                )}
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <TranslationGrid
              data={filteredTranslations}
              languages={languages.filter(l => visibleLanguages.has(l.code))}
              projectId={selectedProject}
            />
          </div>
        )}
      </main>
    </div>
  );
}
