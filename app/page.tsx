'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { getProjects, getProjectLanguages, getTranslationsGrid, createTranslationKey } from '@/lib/translations';
import { TranslationRow } from '@/lib/supabase';
import TranslationGrid from '@/components/TranslationGrid';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DropdownMenuCheckboxItem } from '@/components/ui/DropdownMenu';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SidePanel } from '@/components/ui/SidePanel';
import { Spinner } from '@/components/ui/Spinner';

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
  // Columns visibility handled via DropdownMenu
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [visibleLanguages, setVisibleLanguages] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelKeyIndex, setPanelKeyIndex] = useState<number | null>(null);
  const [columnsSearch, setColumnsSearch] = useState('');
  const VISIBLE_KEY_PREFIX = 'glotter-visible-langs-';

  const sortedLanguages = useMemo(() => {
    return [...languages].sort((a, b) => {
      const aEn = a.code.toLowerCase() === 'en';
      const bEn = b.code.toLowerCase() === 'en';
      if (aEn && !bEn) return -1;
      if (!aEn && bEn) return 1;
      return a.code.localeCompare(b.code);
    });
  }, [languages]);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectData(selectedProject);
    }
  }, [selectedProject]);

  const applyFilters = useCallback(() => {
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
  }, [translations, searchQuery, filterMode]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    // Initialize visible languages from localStorage (per-project), or default to 3 (EN first)
    if (!selectedProject) return;
    try {
      const saved = typeof window !== 'undefined'
        ? window.localStorage.getItem(VISIBLE_KEY_PREFIX + selectedProject)
        : null;
      let codes: string[] | null = null;
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed)) codes = parsed;
      }
      const availableCodes = new Set(sortedLanguages.map(l => l.code));
      const initial = codes && codes.length > 0
        ? new Set(codes.filter(c => availableCodes.has(c)))
        : new Set(sortedLanguages.slice(0, 2).map(l => l.code));
      setVisibleLanguages(initial);
    } catch {
      setVisibleLanguages(new Set(sortedLanguages.slice(0, 2).map(l => l.code)));
    }
  }, [sortedLanguages, languages, selectedProject]);

  function persistVisibleLanguages(next: Set<string>) {
    if (!selectedProject) return;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          VISIBLE_KEY_PREFIX + selectedProject,
          JSON.stringify(Array.from(next))
        );
      }
    } catch {}
  }

  // duplicate applyFilters removed (now defined via useCallback above)

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

  function openAllLanguagesPanel(rowIndex: number) {
    setPanelKeyIndex(rowIndex);
    setPanelOpen(true);
  }

  function handleDeletedKeys(keyIds: string[]) {
    if (!keyIds || keyIds.length === 0) return;
    setTranslations(prev => prev.filter(r => !keyIds.includes(r.key_id)));
    setFilteredTranslations(prev => prev.filter(r => !keyIds.includes(r.key_id)));
    setLiveMessage(`${keyIds.length} key${keyIds.length > 1 ? 's' : ''} deleted`);
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-foreground">
        <div className="bg-surface-elevated p-8 rounded-xl shadow-card border border-border max-w-md">
          <h2 className="text-xl font-bold text-danger mb-4">Error</h2>
          <p className="mb-4">{error}</p>
          <p className="text-sm text-muted">
            Make sure you’ve added your Supabase credentials to .env.local:
          </p>
          <pre className="mt-2 p-3 bg-surface-hover rounded text-xs overflow-x-auto">
            NEXT_PUBLIC_SUPABASE_URL=your-url{'\n'}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-surface-elevated/95 backdrop-blur border-b border-border/60 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Image src="/chinese.svg" alt="Glotter" width={28} height={28} className="h-7 w-7" priority />
              <h1 className="text-lg font-semibold tracking-tight">Glotter</h1>
            </div>
            {projects.length > 0 && (
              <>
                <div className="w-px h-4 bg-border"></div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="pl-2 pr-1.5 py-1 gap-1.5">
                      <span>
                        {selectedProject
                          ? projects.find(p => p.id === selectedProject)?.name
                          : "Select a project..."}
                      </span>
                      <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    {projects.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => setSelectedProject(project.id)}
                        className={cn(
                          project.id === selectedProject
                            ? "bg-primary-soft text-foreground font-medium"
                            : "",
                          "data-[highlighted]:bg-surface-hover"
                        )}
                      >
                        {project.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div aria-live="polite" aria-atomic="true" className="sr-only">{liveMessage}</div>
        {loading ? (
          <div className="space-y-4">
            <div className="bg-surface-elevated px-6 py-6 rounded-xl shadow-card border border-border">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-6">
                  <Skeleton className="h-6 w-16" />
                  <div className="h-6 w-px bg-border"></div>
                  <Skeleton className="h-6 w-16" />
                </div>
                <Skeleton className="h-9 w-28" />
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
            <div className="w-full overflow-hidden rounded-xl bg-surface-elevated shadow-card border border-border">
              <div className="p-6 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-surface-elevated p-12 rounded-xl shadow-card text-center border border-border">
            <h2 className="text-2xl font-bold mb-3">No Projects Found</h2>
            <p className="text-muted">
              Create a project in your Supabase database to get started.
            </p>
          </div>
        ) : !selectedProject ? (
          <div className="bg-surface-elevated p-12 rounded-xl shadow-card text-center border border-border">
            <h2 className="text-2xl font-bold mb-3">Select a Project</h2>
            <p className="text-muted">
              Choose a project from the dropdown above to view and manage translations.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-surface-elevated px-6 py-6 rounded-xl shadow-card border border-border">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-6">
                  <div className="text-sm font-medium text-muted">
                    <span className="text-lg font-bold">{translations.length}</span>
                    <span className="ml-1.5 text-muted">keys</span>
                  </div>
                  <div className="h-6 w-px bg-border"></div>
                  <div className="text-sm font-medium text-muted">
                    <span className="text-lg font-bold">{languages.length}</span>
                    <span className="ml-1.5 text-muted">languages</span>
                  </div>
                  {filterMode !== 'all' && (
                    <>
                      <div className="h-6 w-px bg-border"></div>
                      <div className="text-sm font-medium text-muted">
                        <span className="text-lg font-bold text-warning">{filteredTranslations.length}</span>
                        <span className="ml-1.5 text-muted">filtered</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="md" className="gap-2">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64" align="end">
                      <DropdownMenuLabel>Export Translations</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => exportAllLanguages()} className="gap-2">
                        <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                        All Languages (JSON)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Individual Languages</DropdownMenuLabel>
                      {sortedLanguages.map(lang => (
                        <DropdownMenuItem key={lang.code} onClick={() => exportLanguage(lang.code)}>
                          <span className="font-medium">{lang.code.toUpperCase()}</span>
                          {lang.name && <span className="text-xs text-muted ml-2">({lang.name})</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Dialog open={isAddKeyOpen} onOpenChange={setIsAddKeyOpen}>
                    <DialogTrigger asChild>
                      <Button>+ Add New Key</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Translation Key</DialogTitle>
                        <DialogDescription>Provide a unique key name. You can add values per-language later.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1">Key</label>
                          <input
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="e.g. common.save"
                            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="outline" onClick={() => setIsAddKeyOpen(false)}>Cancel</Button>
                          <Button
                            onClick={async () => {
                              if (!newKeyName.trim() || !selectedProject) return;
                              try {
                                setCreatingKey(true);
                                const { id } = await createTranslationKey(selectedProject, newKeyName.trim());
                                setLiveMessage(`Created key ${newKeyName}`);
                                setNewKeyName('');
                                setIsAddKeyOpen(false);
                                // Reload data to include new key
                                await loadProjectData(selectedProject);
                              } catch (e) {
                                console.error(e);
                                setLiveMessage('Failed to create key');
                              } finally {
                                setCreatingKey(false);
                              }
                            }}
                            disabled={!newKeyName.trim() || creatingKey}
                          >
                            {creatingKey ? (
                              <span className="inline-flex items-center gap-2">
                                <Spinner size={14} />
                                Creating…
                              </span>
                            ) : (
                              'Create Key'
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
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
                    className="w-full px-4 py-2 pl-10 border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all text-sm"
                  />
                  <svg className="absolute left-3 top-2.5 h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                <div className="flex items-center gap-2">
                  <SegmentedControl
                    ariaLabel="Filter translations"
                    value={filterMode}
                    onValueChange={(v) => setFilterMode(v as 'all' | 'missing' | 'complete')}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'missing', label: 'Missing' },
                      { value: 'complete', label: 'Complete' },
                    ]}
                  />

                  {sortedLanguages.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="ml-2 gap-2">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                      </svg>
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel className="text-muted-foreground">Languages</DropdownMenuLabel>
                    <div className="px-2 py-1.5">
                      <input
                        value={columnsSearch}
                        onChange={(e) => setColumnsSearch(e.target.value)}
                        placeholder="Search languages..."
                        className="w-full px-2 py-1 border border-border rounded bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <DropdownMenuSeparator />
                    <div className="px-2 pb-1 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const all = new Set(languages.map(l => l.code));
                          setVisibleLanguages(all);
                          persistVisibleLanguages(all);
                        }}
                      >
                        Select all
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const none = new Set<string>();
                          setVisibleLanguages(none);
                          persistVisibleLanguages(none);
                        }}
                      >
                        Select none
                      </Button>
                      
                    </div>
                    <DropdownMenuSeparator />
                    {sortedLanguages
                      .filter(lang => {
                        const q = columnsSearch.trim().toLowerCase();
                        if (!q) return true;
                        const code = lang.code.toLowerCase();
                        const name = (lang.name || '').toLowerCase();
                        return code.includes(q) || name.includes(q);
                      })
                      .map(lang => (
                        <DropdownMenuCheckboxItem
                          key={lang.code}
                          checked={visibleLanguages.has(lang.code)}
                          onCheckedChange={(checked) => {
                            const newVisible = new Set(visibleLanguages);
                            if (!checked) {
                              newVisible.delete(lang.code);
                            } else {
                              newVisible.add(lang.code);
                            }
                            setVisibleLanguages(newVisible);
                            persistVisibleLanguages(newVisible);
                          }}
                        >
                          <span className="text-sm font-medium">{lang.code.toUpperCase()}</span>
                          {lang.name && (
                            <span className="text-xs text-muted ml-2">{lang.name}</span>
                          )}
                        </DropdownMenuCheckboxItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                  )}
                </div>
              </div>
            </div>

            <TranslationGrid
              data={filteredTranslations}
              languages={sortedLanguages.filter(l => visibleLanguages.has(l.code))}
            onOpenAllLanguages={openAllLanguagesPanel}
            onDeletedKeys={handleDeletedKeys}
            />

          <SidePanel
            open={panelOpen}
            onOpenChange={setPanelOpen}
            title={panelKeyIndex != null ? filteredTranslations[panelKeyIndex]?.key : 'All Languages'}
            description={panelKeyIndex != null ? 'Edit values for all languages' : undefined}
          >
            {panelKeyIndex != null && (
              <div className="space-y-3">
                {sortedLanguages.map((lang) => {
                  const row = filteredTranslations[panelKeyIndex!];
                  const current = row?.translations[lang.code]?.value || '';
                  return (
                    <div key={lang.code}>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        {lang.code.toUpperCase()} {lang.name ? `(${lang.name})` : ''}
                      </label>
                      <textarea
                        defaultValue={current}
                        className="w-full p-2 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                        rows={3}
                      />
                    </div>
                  );
                })}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setPanelOpen(false)}>Close</Button>
                  <Button onClick={() => setPanelOpen(false)}>Save</Button>
                </div>
              </div>
            )}
          </SidePanel>
          </div>
        )}
      </main>
    </div>
  );
}
