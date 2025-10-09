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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Glotter</h1>
              <p className="text-sm text-gray-500 mt-1">Manage your translations across multiple languages</p>
            </div>
            {projects.length > 0 && (
              <div className="flex items-center gap-3">
                <label htmlFor="project-select" className="text-sm font-semibold text-gray-700">
                  Project:
                </label>
                <div className="relative">
                  <select
                    id="project-select"
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className={`appearance-none px-4 py-2.5 pr-10 border-2 rounded-lg shadow-sm bg-white font-medium transition-all cursor-pointer ${
                      selectedProject
                        ? 'border-blue-500 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        : 'border-gray-300 text-gray-500 hover:border-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400'
                    }`}
                  >
                    <option value="" className="text-gray-500">Select a project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id} className="text-gray-900">
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              <div className="text-gray-600 font-medium">Loading translations...</div>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white p-12 rounded-xl shadow-lg text-center border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-700 mb-3">No Projects Found</h2>
            <p className="text-gray-600">
              Create a project in your Supabase database to get started.
            </p>
          </div>
        ) : !selectedProject ? (
          <div className="bg-white p-12 rounded-xl shadow-lg text-center border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-700 mb-3">Select a Project</h2>
            <p className="text-gray-600">
              Choose a project from the dropdown above to view and manage translations.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="bg-white px-6 py-5 rounded-lg shadow-sm border border-gray-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-sm font-semibold text-gray-700">
                    <span className="text-2xl font-bold text-blue-600">{translations.length}</span> total keys
                  </div>
                  <div className="h-6 w-px bg-gray-300"></div>
                  <div className="text-sm font-semibold text-gray-700">
                    <span className="text-2xl font-bold text-green-600">{languages.length}</span> languages
                  </div>
                  {filterMode !== 'all' && (
                    <>
                      <div className="h-6 w-px bg-gray-300"></div>
                      <div className="text-sm font-semibold text-gray-700">
                        <span className="text-2xl font-bold text-orange-600">{filteredTranslations.length}</span> filtered
                      </div>
                    </>
                  )}
                </div>
                <button className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-all shadow-md hover:shadow-lg font-medium">
                  + Add New Key
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Search translation keys or values..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                  <svg className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-4 py-2 rounded-md font-medium transition-all ${
                      filterMode === 'all'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilterMode('missing')}
                    className={`px-4 py-2 rounded-md font-medium transition-all ${
                      filterMode === 'missing'
                        ? 'bg-white text-red-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Missing
                  </button>
                  <button
                    onClick={() => setFilterMode('complete')}
                    className={`px-4 py-2 rounded-md font-medium transition-all ${
                      filterMode === 'complete'
                        ? 'bg-white text-green-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Complete
                  </button>
                </div>
              </div>
            </div>

            <TranslationGrid
              data={filteredTranslations}
              languages={languages}
              projectId={selectedProject}
            />
          </div>
        )}
      </main>
    </div>
  );
}
