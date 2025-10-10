'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { getProjects, getProjectLanguages, getTranslationsGrid, createTranslationKey, createProject, addLanguage, deleteLanguage, deleteProject, updateLanguageName, bulkUpsertTranslations, deleteMissingTranslations } from '@/lib/translations';
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
import { ImportMode, toKeyToValueMap, setNested, decodeUnicodeEscapes } from '@/lib/importExport';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SidePanel } from '@/components/ui/SidePanel';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { Upload, Download } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

interface Language {
  code: string;
  name: string | null;
}

export default function Home() {
  const { toast } = useToast();
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
  // Project & language dialogs
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [initialLangs, setInitialLangs] = useState('en');
  const [creatingProject, setCreatingProject] = useState(false);
  const [isManageLangsOpen, setIsManageLangsOpen] = useState(false);
  const [newLangCode, setNewLangCode] = useState('');
  const [newLangName, setNewLangName] = useState('');
  const [langSubmitting, setLangSubmitting] = useState(false);
  const [editingLang, setEditingLang] = useState<string | null>(null);
  const [editingLangName, setEditingLangName] = useState<string>('');
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [confirmProjectName, setConfirmProjectName] = useState('');
  const [deletingProject, setDeletingProject] = useState(false);

  // Import dialog state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importTargetLang, setImportTargetLang] = useState<string>('');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<{ add: number; update: number; unchanged: number; total: number } | null>(null);
  const [importPayload, setImportPayload] = useState<Record<string, string | null> | null>(null);
  const [importFileName, setImportFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [clearBeforeImport, setClearBeforeImport] = useState(false);

  // Export dialog state
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [exportFallbackLang, setExportFallbackLang] = useState<string>('en');
  const [fallbackMissingCount, setFallbackMissingCount] = useState<number>(0);

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

  function exportLanguage(langCode: string, fallbackLang: string) {
    // Build flat maps for target and fallback
    const fallbackMap: Record<string, string | null> = {};
    const targetMap: Record<string, string | null> = {};
    translations.forEach(row => {
      fallbackMap[row.key] = row.translations[fallbackLang]?.value ?? null;
      targetMap[row.key] = row.translations[langCode]?.value ?? null;
    });

    // Reconstruct nested with fallback
    const nested: Record<string, unknown> = {};
    Object.keys(targetMap).forEach(k => {
      const val = targetMap[k] ?? fallbackMap[k];
      if (val != null) setNested(nested as any, k, val);
    });

    // ASCII-only
    const json = JSON.stringify(nested, null, 2).replace(/[\u0080-\uFFFF]/g, (ch) => {
      const code = ch.charCodeAt(0).toString(16).padStart(4, '0');
      return `\\u${code}`;
    });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${langCode}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // removed all-languages JSON export per user request

  async function exportAllLanguagesZip(selectedCodes: string[], fallbackLang: string) {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Precompute fallback map
      const fbMap: Record<string, string | null> = {};
      translations.forEach(row => { fbMap[row.key] = row.translations[fallbackLang]?.value ?? null; });

      for (const code of selectedCodes) {
        const nested: Record<string, unknown> = {};
        translations.forEach(row => {
          const val = row.translations[code]?.value ?? fbMap[row.key];
          if (val != null) setNested(nested as any, row.key, val);
        });
        // ASCII-only export: escape non-ASCII to \uXXXX
        const json = JSON.stringify(nested, null, 2).replace(/[\u0080-\uFFFF]/g, (ch) => {
          const code = ch.charCodeAt(0).toString(16).padStart(4, '0');
          return `\\u${code}`;
        });
        zip.file(`${code}.json`, json);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
      a.download = `translations-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', description: 'Failed to create ZIP export.', variant: 'error' });
    }
  }

  function resetImportFileState() {
    setImportFileName('');
    setImportPreview(null);
    setImportPayload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function openAllLanguagesPanel(rowIndex: number) {
    setPanelKeyIndex(rowIndex);
    setPanelOpen(true);
  }

  function handleDeletedKeys(keyIds: string[]) {
    if (!keyIds || keyIds.length === 0) return;
    setTranslations(prev => prev.filter(r => !keyIds.includes(r.key_id)));
    setFilteredTranslations(prev => prev.filter(r => !keyIds.includes(r.key_id)));
    const msg = `${keyIds.length} key${keyIds.length > 1 ? 's' : ''} deleted`;
    setLiveMessage(msg);
    toast({ title: 'Deleted', description: msg, variant: 'success' });
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
                    <DropdownMenuItem onClick={() => setIsCreateProjectOpen(true)} className="font-medium">
                      + New project…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
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
                {selectedProject && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="px-2 py-1" aria-label="Project actions">
                        <svg className="h-4 w-4 text-muted" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="5" cy="12" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="19" cy="12" r="2" />
                        </svg>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48" align="start">
                      <DropdownMenuItem onClick={() => setIsManageLangsOpen(true)}>Manage languages…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIsDeleteProjectOpen(true)} className="text-danger focus:text-danger">Delete project…</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
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
              Create a project to get started.
            </p>
            <div className="mt-6">
              <Button onClick={() => setIsCreateProjectOpen(true)}>+ Create project</Button>
            </div>
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
                  <Button
                    variant="outline"
                    size="md"
                    className="gap-2"
                    onClick={() => {
                      resetImportFileState();
                      setImportTargetLang(sortedLanguages[0]?.code || 'en');
                      setImportMode('merge');
                      setDeleteMissing(false);
                      setClearBeforeImport(false);
                      setIsImportOpen(true);
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    Import
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    className="gap-2"
                    onClick={() => {
                      // Open Export Languages dialog directly
                      setExportSelected(new Set(languages.map(l => l.code))); // preselect all
                      const defaultFallback = languages.find(l => l.code.toLowerCase() === 'en')?.code || languages[0]?.code || '';
                      setExportFallbackLang(defaultFallback);
                      const missing = translations.reduce((acc, row) => acc + ((row.translations[defaultFallback]?.value ?? null) == null ? 1 : 0), 0);
                      setFallbackMissingCount(missing);
                      setIsExportOpen(true);
                    }}
                  >
                    <Download className="h-4 w-4" />
                        Export
                      </Button>
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
                                const successMsg = `Created key ${newKeyName}`;
                                setLiveMessage(successMsg);
                                toast({ title: 'Key created', description: successMsg, variant: 'success' });
                                setNewKeyName('');
                                setIsAddKeyOpen(false);
                                // Reload data to include new key
                                await loadProjectData(selectedProject);
                              } catch (e) {
                                console.error(e);
                                const msg = 'Failed to create key';
                                setLiveMessage(msg);
                                toast({ title: 'Error', description: msg, variant: 'error' });
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
      {/* Create Project Dialog */}
      <Dialog open={isCreateProjectOpen} onOpenChange={setIsCreateProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>Provide a name and optional initial languages (comma-separated codes).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Project name</label>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                placeholder="e.g. Mobile App"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Initial languages</label>
              <input
                value={initialLangs}
                onChange={(e) => setInitialLangs(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                placeholder="en:English, fr:French, de:German (names optional)"
              />
              <p className="mt-1 text-xs text-muted">Format: code or code:name, comma-separated. Example: en:English, fr:French</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsCreateProjectOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  if (!newProjectName.trim()) return;
                  try {
                    setCreatingProject(true);
                    const langs = initialLangs
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .map(token => {
                        const parts = token.split(':');
                        const code = (parts[0] || '').trim().toLowerCase();
                        const name = parts.slice(1).join(':').trim();
                        return { code, name: name || undefined as string | undefined };
                      });
                    const project = await createProject(newProjectName.trim(), langs);
                    setProjects(prev => [...prev, project]);
                    setSelectedProject(project.id);
                    setIsCreateProjectOpen(false);
                    setNewProjectName('');
                    setInitialLangs('en');
                    setLiveMessage(`Created project ${project.name}`);
                    toast({ title: 'Project created', description: `Project ${project.name} created`, variant: 'success' });
                    // Offer import for the first language
                    const primaryLang = (langs[0]?.code || 'en').toLowerCase();
                    resetImportFileState();
                    setImportTargetLang(primaryLang);
                    setImportMode('merge');
                    setDeleteMissing(false);
                    setIsImportOpen(true);
                  } catch (e) {
                    console.error(e);
                    toast({ title: 'Error', description: 'Failed to create project', variant: 'error' });
                  } finally {
                    setCreatingProject(false);
                  }
                }}
                disabled={!newProjectName.trim() || creatingProject}
              >
                {creatingProject ? (
                  <span className="inline-flex items-center gap-2"><Spinner size={14} />Creating…</span>
                ) : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Languages Dialog */}
      <Dialog
        open={isManageLangsOpen}
        onOpenChange={(open) => {
          setIsManageLangsOpen(open);
          // Reset transient edit state when dialog is closed or reopened
          setEditingLang(null);
          setEditingLangName('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage languages</DialogTitle>
            <DialogDescription>Add or remove languages for this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Code</label>
                <input
                  value={newLangCode}
                  onChange={(e) => setNewLangCode(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  placeholder="e.g. en, fr, pt-br"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Name (optional)</label>
                <input
                  value={newLangName}
                  onChange={(e) => setNewLangName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  placeholder="e.g. English"
                />
              </div>
              <Button
                onClick={async () => {
                  if (!selectedProject || !newLangCode.trim()) return;
                  try {
                    setLangSubmitting(true);
                    const code = newLangCode.trim();
                    await addLanguage(selectedProject, code, newLangName.trim() || undefined);
                    await loadProjectData(selectedProject);
                    setNewLangCode('');
                    setNewLangName('');
                    toast({ title: 'Language added', description: `Added ${code.toUpperCase()}`, variant: 'success' });
                    // Prompt to import for the new language
                    resetImportFileState();
                    setImportTargetLang(code.toLowerCase());
                    setImportMode('merge');
                    setDeleteMissing(false);
                    setIsImportOpen(true);
                  } catch (e) {
                    console.error(e);
                    toast({ title: 'Error', description: 'Failed to add language', variant: 'error' });
                  } finally {
                    setLangSubmitting(false);
                  }
                }}
                disabled={!newLangCode.trim() || langSubmitting}
              >
                {langSubmitting ? 'Adding…' : 'Add'}
              </Button>
            </div>

            <div className="border border-border rounded-lg divide-y divide-border">
              {sortedLanguages.length === 0 && (
                <div className="p-3 text-sm text-muted">No languages yet.</div>
              )}
              {sortedLanguages.map((lang) => (
                <div key={lang.code} className="p-3 flex items-center justify-between gap-3">
                  <div className="text-sm flex-1">
                    <span className="font-medium mr-2">{lang.code.toUpperCase()}</span>
                    {editingLang === lang.code ? (
                      <input
                        autoFocus
                        value={editingLangName}
                        onChange={(e) => setEditingLangName(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            if (!selectedProject) return;
                            try {
                              setLangSubmitting(true);
                              await updateLanguageName(selectedProject, lang.code, editingLangName.trim() || null);
                              await loadProjectData(selectedProject);
                              setEditingLang(null);
                              setEditingLangName('');
                              toast({ title: 'Saved', description: 'Language name updated', variant: 'success' });
                            } catch (err) {
                              console.error(err);
                              toast({ title: 'Error', description: 'Failed to update language name', variant: 'error' });
                            } finally {
                              setLangSubmitting(false);
                            }
                          } else if (e.key === 'Escape') {
                            setEditingLang(null);
                            setEditingLangName('');
                          }
                        }}
                        className="px-2 py-1 border border-border rounded bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Display name"
                      />
                    ) : (
                      <button
                        className="text-muted hover:text-foreground"
                        onClick={() => {
                          setEditingLang(lang.code);
                          setEditingLangName(lang.name || '');
                        }}
                        aria-label={`Edit name for ${lang.code}`}
                      >
                        {lang.name ? <span>{lang.name}</span> : <span className="italic text-muted">Add name</span>}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingLang === lang.code && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!selectedProject) return;
                          try {
                            setLangSubmitting(true);
                            await updateLanguageName(selectedProject, lang.code, editingLangName.trim() || null);
                            await loadProjectData(selectedProject);
                            setEditingLang(null);
                            setEditingLangName('');
                            toast({ title: 'Saved', description: 'Language name updated', variant: 'success' });
                          } catch (err) {
                            console.error(err);
                            toast({ title: 'Error', description: 'Failed to update language name', variant: 'error' });
                          } finally {
                            setLangSubmitting(false);
                          }
                        }}
                        disabled={langSubmitting}
                      >
                        Save
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (!selectedProject) return;
                        if (sortedLanguages.length <= 1) {
                          toast({ title: 'Cannot delete', description: 'Add another language before removing the last one.', variant: 'error' });
                          return;
                        }
                        try {
                          setLangSubmitting(true);
                          await deleteLanguage(selectedProject, lang.code);
                          await loadProjectData(selectedProject);
                          toast({ title: 'Language removed', description: `Removed ${lang.code.toUpperCase()}`, variant: 'success' });
                        } catch (e) {
                          console.error(e);
                          toast({ title: 'Error', description: 'Failed to remove language', variant: 'error' });
                        } finally {
                          setLangSubmitting(false);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Project Dialog */}
      <Dialog open={isDeleteProjectOpen} onOpenChange={setIsDeleteProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>This will delete the project and all keys and translations. Type the project name to confirm.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              value={confirmProjectName}
              onChange={(e) => setConfirmProjectName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-danger focus:border-danger text-sm"
              placeholder={projects.find(p => p.id === selectedProject)?.name || ''}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDeleteProjectOpen(false)} disabled={deletingProject}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const proj = projects.find(p => p.id === selectedProject);
                  if (!proj || confirmProjectName.trim() !== proj.name) return;
                  try {
                    setDeletingProject(true);
                    await deleteProject(proj.id);
                    // Refresh projects list
                    const refreshed = await getProjects();
                    setProjects(refreshed);
                    setSelectedProject('');
                    setLanguages([]);
                    setTranslations([]);
                    setFilteredTranslations([]);
                    setIsDeleteProjectOpen(false);
                    setConfirmProjectName('');
                    toast({ title: 'Project deleted', description: `${proj.name} deleted`, variant: 'success' });
                  } catch (e) {
                    console.error(e);
                    toast({ title: 'Error', description: 'Failed to delete project', variant: 'error' });
                  } finally {
                    setDeletingProject(false);
                  }
                }}
                disabled={deletingProject || confirmProjectName.trim() !== (projects.find(p => p.id === selectedProject)?.name || '')}
              >
                {deletingProject ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Languages Dialog */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export languages</DialogTitle>
            <DialogDescription>Select languages and an optional fallback language.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Fallback language</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="truncate">
                      {exportFallbackLang.toUpperCase()} {sortedLanguages.find(l => l.code === exportFallbackLang)?.name ? `(${sortedLanguages.find(l => l.code === exportFallbackLang)?.name})` : ''}
                    </span>
                    <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-auto w-64">
                  {sortedLanguages.map(l => (
                    <DropdownMenuItem key={l.code} onClick={() => {
                      setExportFallbackLang(l.code);
                      const missing = translations.reduce((acc, row) => acc + ((row.translations[l.code]?.value ?? null) == null ? 1 : 0), 0);
                      setFallbackMissingCount(missing);
                    }}>
                      <span className="font-medium">{l.code.toUpperCase()}</span>
                      {l.name && <span className="text-xs text-muted ml-2">({l.name})</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {fallbackMissingCount > 0 && (
                <p className="mt-1 text-xs text-warning">Warning: {fallbackMissingCount} keys are missing values in the selected fallback language.</p>
              )}
    </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted">Select languages</div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportSelected(new Set(languages.map(l => l.code)))}
                >
                  Select all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportSelected(new Set())}
                >
                  Select none
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-80 overflow-auto border border-border rounded-md p-2">
              {sortedLanguages.map(l => {
                const checked = exportSelected.has(l.code);
                return (
                  <label key={l.code} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(exportSelected);
                        if (e.target.checked) next.add(l.code); else next.delete(l.code);
                        setExportSelected(next);
                      }}
                    />
                    <span className="font-medium">{l.code.toUpperCase()}</span>
                    {l.name && <span className="text-xs text-muted">({l.name})</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsExportOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  const selected = Array.from(exportSelected);
                  if (selected.length === 0) return;
                  if (selected.length === 1) {
                    exportLanguage(selected[0], exportFallbackLang);
                  } else {
                    // zip only selected languages
                    try {
                      await exportAllLanguagesZip(selected, exportFallbackLang);
                    } catch (e) {
                      console.error(e);
                      toast({ title: 'Export failed', description: 'Failed to create ZIP export.', variant: 'error' });
                    }
                  }
                  setIsExportOpen(false);
                }}
                disabled={exportSelected.size === 0}
              >
                Export
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Import JSON Dialog */}
      <Dialog
        open={isImportOpen}
        onOpenChange={(open) => {
          setIsImportOpen(open);
          // Always reset file-related transient state so reopening shows a clean slate
          resetImportFileState();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import JSON</DialogTitle>
            <DialogDescription>Upload a JSON file to populate values. Default scope is a single language.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Target language</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="truncate">
                        {importTargetLang.toUpperCase()} {sortedLanguages.find(l => l.code === importTargetLang)?.name ? `(${sortedLanguages.find(l => l.code === importTargetLang)?.name})` : ''}
                      </span>
                      <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-64 overflow-auto w-64">
                    {sortedLanguages.map(l => (
                      <DropdownMenuItem key={l.code} onClick={() => setImportTargetLang(l.code)}>
                        <span className="font-medium">{l.code.toUpperCase()}</span>
                        {l.name && <span className="text-xs text-muted ml-2">({l.name})</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Mode</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="truncate">
                        {importMode === 'add-only' ? 'Add-only' : importMode === 'merge' ? 'Merge (default)' : 'Overwrite'}
                      </span>
                      <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => setImportMode('add-only')}>Add-only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setImportMode('merge')}>Merge (default)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setImportMode('overwrite')}>Overwrite</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">JSON file</label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImportFileName(file.name);
                    try {
                      const text = await file.text();
                      const json = JSON.parse(text);
                      // Support {key:value} (language-specific) and {key:{lang:value}} / [{key,lang,value}] later
                      let map: Record<string, string | null> = {};
                      if (json && typeof json === 'object' && !Array.isArray(json)) {
                        // Decode any \uXXXX in string leaves
                        const decodedObj: Record<string, unknown> = {};
                        Object.entries(json as Record<string, unknown>).forEach(([k, v]) => {
                          decodedObj[k] = typeof v === 'string' ? decodeUnicodeEscapes(v) : v;
                        });
                        map = toKeyToValueMap(decodedObj);
                      } else if (Array.isArray(json)) {
                        const tmp: Record<string, unknown> = {};
                        for (const rec of json as Array<any>) {
                          if (rec && typeof rec.key === 'string' && (rec.lang == null || String(rec.lang).toLowerCase() === importTargetLang)) {
                            tmp[rec.key] = typeof rec.value === 'string' ? decodeUnicodeEscapes(rec.value) : rec.value;
                          }
                        }
                        map = toKeyToValueMap(tmp);
                      }

                      // Build current map for preview
                      const current: Record<string, string | null> = {};
                      translations.forEach(row => {
                        current[row.key] = row.translations[importTargetLang]?.value ?? null;
                      });

                      const add = Object.keys(map).filter(k => current[k] == null).length;
                      const update = Object.keys(map).filter(k => current[k] != null && current[k] !== map[k]).length;
                      const unchanged = Object.keys(map).length - add - update;
                      setImportPreview({ add, update, unchanged, total: Object.keys(map).length });
                      setImportPayload(map);
                    } catch (err) {
                      console.error(err);
                      toast({ title: 'Invalid JSON', description: 'Please upload a valid JSON file.', variant: 'error' });
                    }
                  }}
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} aria-label="Choose JSON file">
                  Choose JSON file
                </Button>
                <span className="text-sm text-muted truncate max-w-[50%]">{importFileName || 'No file selected'}</span>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={deleteMissing} onChange={(e) => setDeleteMissing(e.target.checked)} />
              Also delete keys missing from file (destructive)
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={clearBeforeImport} onChange={(e) => setClearBeforeImport(e.target.checked)} />
              Clear existing values for target language before import (keeps keys)
            </label>

            {importPreview && (
              <div className="text-sm text-muted">
                <div>Total: <span className="text-foreground font-medium">{importPreview.total}</span></div>
                <div>Add: <span className="text-foreground font-medium">{importPreview.add}</span> · Update: <span className="text-foreground font-medium">{importPreview.update}</span> · Unchanged: <span className="text-foreground font-medium">{importPreview.unchanged}</span></div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  resetImportFileState();
                  setIsImportOpen(false);
                }}
                disabled={importBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!selectedProject || !importPayload) return;
                  try {
                    setImportBusy(true);
                    if (clearBeforeImport) {
                      // Remove all translations for the target language, keep keys and language
                      await deleteMissingTranslations(selectedProject, importTargetLang, []);
                    }
                    // Build entries and honor import mode
                    const baseEntries = Object.entries(importPayload).map(([key, value]) => ({ key, langCode: importTargetLang, value }));

                    // Current values for the target language
                    const currentMap: Record<string, string | null> = {};
                    translations.forEach(row => {
                      currentMap[row.key] = row.translations[importTargetLang]?.value ?? null;
                    });

                    let entries = baseEntries;
                    if (importMode === 'add-only') {
                      entries = baseEntries.filter(e => currentMap[e.key] == null);
                    } else if (importMode === 'merge') {
                      entries = baseEntries.filter(e => currentMap[e.key] !== (e.value ?? null));
                    } else {
                      // overwrite → keep all
                    }
                    await bulkUpsertTranslations(selectedProject, entries);
                    if (deleteMissing) {
                      await deleteMissingTranslations(selectedProject, importTargetLang, Object.keys(importPayload));
                    }
                    await loadProjectData(selectedProject);
                    setIsImportOpen(false);
                    toast({ title: 'Import complete', description: 'Translations imported successfully.', variant: 'success' });
                  } catch (e) {
                    console.error(e);
                    toast({ title: 'Import failed', description: 'Failed to import translations.', variant: 'error' });
                  } finally {
                    setImportBusy(false);
                  }
                }}
                disabled={importBusy || !importPayload}
              >
                {importBusy ? 'Importing…' : 'Apply import'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
