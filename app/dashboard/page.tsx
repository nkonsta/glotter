'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import packageJson from '@/package.json';
import { getProjects, getProjectLanguages, getTranslationsGrid, createTranslationKey, createProject, addLanguage, deleteLanguage, deleteProject, updateLanguageName, bulkUpsertTranslations, deleteMissingTranslations, getProjectMembership, type ProjectMembership } from '@/lib/translations';
import { TranslationRow } from '@/lib/supabase';
import ManageProjectMembersDialog from '@/components/admin/ManageProjectMembersDialog';
import UserManagementDialog from '@/components/admin/UserManagementDialog';
import ChangePasswordDialog from '@/components/admin/ChangePasswordDialog';
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
import { Upload, Download, WandSparkles } from 'lucide-react';
import AuthScreen from '@/components/auth/AuthScreen';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { AiSuggestedTranslation, AiTranslateResponseBody } from '@/lib/ai/types';

const FALLBACK_NONE = '__none__';

interface Project {
  id: string;
  name: string;
}

interface Language {
  code: string;
  name: string | null;
}

interface ImportArrayRecord {
  key: string;
  lang?: unknown;
  value?: unknown;
}

function isImportArrayRecord(value: unknown): value is ImportArrayRecord {
  return typeof value === 'object' && value !== null && typeof (value as { key?: unknown }).key === 'string';
}

export default function Home() {
  const { toast } = useToast();
  const { user, session, loading: authLoading, signOut: signOutUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [languages, setLanguages] = useState<Language[]>([]);
  const [translations, setTranslations] = useState<TranslationRow[]>([]);
  const [filteredTranslations, setFilteredTranslations] = useState<TranslationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCount, setLoadingCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'complete'>('all');
  // Columns visibility handled via DropdownMenu
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
  const [isManageMembersOpen, setIsManageMembersOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [projectMembership, setProjectMembership] = useState<ProjectMembership | null>(null);

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
  const [signingOut, setSigningOut] = useState(false);

  // Export dialog state
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [exportFallbackLang, setExportFallbackLang] = useState<string>('en');
  const [fallbackMissingCount, setFallbackMissingCount] = useState<number>(0);
  const [exportBusy, setExportBusy] = useState(false);
  // AI translate dialog
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiSourceLang, setAiSourceLang] = useState<string>('en');
  const [aiTargets, setAiTargets] = useState<Set<string>>(new Set());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiGlossaryCsv, setAiGlossaryCsv] = useState('');
  const [aiPreview, setAiPreview] = useState<Record<string, AiSuggestedTranslation[]> | null>(null);
  // Bulk AI chunking state
  const [aiChunking, setAiChunking] = useState<{ running: boolean; processed: number; total: number } | null>(null);
  const aiCancelRef = useRef<{ cancelled: boolean; controller: AbortController | null }>({ cancelled: false, controller: null });

  const sortedLanguages = useMemo(() => {
    return [...languages].sort((a, b) => {
      const aEn = a.code.toLowerCase() === 'en';
      const bEn = b.code.toLowerCase() === 'en';
      if (aEn && !bEn) return -1;
      if (!aEn && bEn) return 1;
      return a.code.localeCompare(b.code);
    });
  }, [languages]);

  const languageCodeSet = useMemo(() => new Set(sortedLanguages.map(lang => lang.code)), [sortedLanguages]);
  const isOwner = projectMembership?.role === 'owner';

  const allowedViewSet = useMemo(() => {
    if (isPlatformAdmin || isOwner) {
      return new Set(languageCodeSet);
    }
    const allowed = new Set<string>();
    (projectMembership?.viewLanguages ?? []).forEach((code) => {
      if (languageCodeSet.has(code)) {
        allowed.add(code);
      }
    });
    return allowed;
  }, [isPlatformAdmin, isOwner, projectMembership, languageCodeSet]);

  const editableLanguageSet = useMemo(() => {
    if (isPlatformAdmin || isOwner) {
      return new Set(languageCodeSet);
    }
    const editable = new Set<string>();
    (projectMembership?.editLanguages ?? []).forEach((code) => {
      if (languageCodeSet.has(code)) {
        editable.add(code);
      }
    });
    return editable;
  }, [isPlatformAdmin, isOwner, projectMembership, languageCodeSet]);

  const persistVisibleLanguages = useCallback((next: Set<string>) => {
    if (!selectedProject) return;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          VISIBLE_KEY_PREFIX + selectedProject,
          JSON.stringify(Array.from(next))
        );
      }
    } catch {}
  }, [selectedProject]);

  const gridLanguages = useMemo(
    () =>
      sortedLanguages.filter(
        (lang) => allowedViewSet.has(lang.code) && visibleLanguages.has(lang.code)
      ),
    [sortedLanguages, allowedViewSet, visibleLanguages]
  );

  const selectedProjectInfo = useMemo(() => {
    return projects.find(project => project.id === selectedProject) ?? null;
  }, [projects, selectedProject]);

  const canManageMembers = isPlatformAdmin || isOwner;
  const canEditCells = isPlatformAdmin || isOwner || editableLanguageSet.size > 0;
  const canImportData = isPlatformAdmin || isOwner;
  const canUseAi = isPlatformAdmin || isOwner;
  const canManageLanguages = isPlatformAdmin || isOwner;
  const canDeleteProject = canManageLanguages;
  const canManageKeys = isPlatformAdmin || isOwner;
  const canAddKey = isPlatformAdmin || isOwner;
  const hasProjectActions = canManageMembers || canManageLanguages || canDeleteProject;
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
    const allowedCodes = Array.from(allowedViewSet);
    const activeCodes = visibleLanguages.size > 0 ? Array.from(visibleLanguages) : allowedCodes;
    if (filterMode === 'missing') {
      filtered = filtered.filter(row =>
        activeCodes.some(code => !(row.translations[code]?.value))
      );
    } else if (filterMode === 'complete') {
      filtered = filtered.filter(row =>
        activeCodes.every(code => !!(row.translations[code]?.value))
      );
    }

    setFilteredTranslations(filtered);
  }, [translations, searchQuery, filterMode, visibleLanguages, allowedViewSet]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    let isMounted = true;

    if (authLoading) {
      return () => {
        isMounted = false;
      };
    }

    if (!user) {
      setIsPlatformAdmin(false);
      setIsManageMembersOpen(false);
      return () => {
        isMounted = false;
      };
    }

    const fetchPlatformRole = async () => {
      try {
        const { data, error } = await supabase.rpc('is_platform_admin');
        if (!isMounted) return;
        if (error) {
          console.error('Failed to determine platform admin status', error);
          setIsPlatformAdmin(false);
          return;
        }
        setIsPlatformAdmin(Boolean(data));
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to determine platform admin status', err);
        setIsPlatformAdmin(false);
      }
    };

    void fetchPlatformRole();

    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (!selectedProject) return;
    const allowedCodes = Array.from(allowedViewSet);
    if (allowedCodes.length === 0) {
      const cleared = new Set<string>();
      setVisibleLanguages(cleared);
      persistVisibleLanguages(cleared);
      return;
    }

    try {
      const saved = typeof window !== 'undefined'
        ? window.localStorage.getItem(VISIBLE_KEY_PREFIX + selectedProject)
        : null;
      let codes: string[] | null = null;
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed)) codes = parsed;
      }

      const filtered = codes && codes.length > 0
        ? codes.filter(code => allowedViewSet.has(code))
        : [];

      const fallback = allowedCodes.slice(0, Math.min(allowedCodes.length, 2));
      const initialCodes = filtered.length > 0 ? filtered : fallback;
      const initial = new Set(initialCodes.length > 0 ? initialCodes : [allowedCodes[0]]);
      setVisibleLanguages(initial);
      persistVisibleLanguages(initial);
    } catch {
      const fallback = new Set(allowedCodes.slice(0, Math.min(allowedCodes.length, 2)));
      if (fallback.size === 0 && allowedCodes[0]) {
        fallback.add(allowedCodes[0]);
      }
      setVisibleLanguages(fallback);
      persistVisibleLanguages(fallback);
    }
  }, [allowedViewSet, persistVisibleLanguages, selectedProject]);

  useEffect(() => {
    if (!canManageLanguages) {
      setIsManageLangsOpen(false);
    }
  }, [canManageLanguages]);

  useEffect(() => {
    if (!canDeleteProject) {
      setIsDeleteProjectOpen(false);
    }
  }, [canDeleteProject]);

  useEffect(() => {
    if (!canAddKey) {
      setIsAddKeyOpen(false);
    }
  }, [canAddKey]);

  useEffect(() => {
    if (!canManageMembers) {
      setIsManageMembersOpen(false);
    }
  }, [canManageMembers]);

  useEffect(() => {
    if (!canUseAi) {
      setIsAiOpen(false);
      setAiPreview(null);
      setAiBusy(false);
      setAiGlossaryCsv('');
      setAiTargets(new Set());
      setAiChunking(null);
      aiCancelRef.current = { cancelled: false, controller: null };
    }
  }, [canUseAi]);

  useEffect(() => {
    if (!canImportData) {
      setIsImportOpen(false);
      resetImportFileState();
    }
  }, [canImportData]);

  // duplicate applyFilters removed (now defined via useCallback above)

  const loadProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load projects. Check your Supabase configuration.');
      setLoading(false);
      console.error(err);
    }
  }, []);

  const loadProjectData = useCallback(async (projectId: string) => {
    try {
      setLoading(true);
      const [langs, membership] = await Promise.all([
        getProjectLanguages(projectId),
        getProjectMembership(projectId)
      ]);

      setLanguages(langs.map(l => ({ code: l.language_code, name: l.language_name })));
      setTranslations([]);
      setFilteredTranslations([]);
      setProjectMembership(membership);
    } catch (err) {
      setError('Failed to load project data');
      setProjectMembership(null);
      setLoading(false);
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProjects([]);
      setLanguages([]);
      setTranslations([]);
      setFilteredTranslations([]);
      setSelectedProject('');
      setProjectMembership(null);
      setVisibleLanguages(new Set());
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    loadProjects();
  }, [authLoading, user, loadProjects]);

  useEffect(() => {
    if (authLoading || !user || !selectedProject) return;
    setProjectMembership(null);
    loadProjectData(selectedProject);
  }, [authLoading, user, selectedProject, loadProjectData]);

  useEffect(() => {
    if (!selectedProject) return;
    if (languages.length === 0) return;
    if (visibleLanguages.size === 0) return;
    let isMounted = true;

    const loadTranslations = async () => {
      try {
        setLoading(true);
        setLoadingCount(0);
        const codes = Array.from(visibleLanguages);
        const trans = await getTranslationsGrid(selectedProject, codes, (loaded) => {
          if (isMounted) setLoadingCount(loaded);
        });
        if (!isMounted) return;
        setTranslations(trans);
        setLoadingCount(null);
        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        setError('Failed to load translations');
        setLoadingCount(null);
        setLoading(false);
        console.error(err);
      }
    };

    void loadTranslations();
    return () => {
      isMounted = false;
      setLoadingCount(null);
    };
  }, [selectedProject, languages, visibleLanguages]);

  useEffect(() => {
    if (!selectedProject) {
      setProjectMembership(null);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;
    if (languages.length === 0) {
      setLoading(false);
      return;
    }
    if (visibleLanguages.size > 0) return;
    if (allowedViewSet.size === 0) {
      setLoading(false);
    }
  }, [selectedProject, languages, visibleLanguages, allowedViewSet]);

  const handleSignOut = useCallback(async () => {
    try {
      setSigningOut(true);
      const { error } = await signOutUser();
      if (error) throw error;
      toast({ title: 'Signed out', description: 'You have been signed out safely.', variant: 'info' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Sign out failed', description: 'Please try again.', variant: 'error' });
    } finally {
      setSigningOut(false);
    }
  }, [signOutUser, toast]);

  async function getExportRows(selectedCodes: string[], fallbackLang: string): Promise<TranslationRow[]> {
    if (!selectedProject) return translations;
    const resolvedFallback = fallbackLang === FALLBACK_NONE ? null : fallbackLang;
    const exportCodes = resolvedFallback
      ? Array.from(new Set([...selectedCodes, resolvedFallback]))
      : selectedCodes;
    const hasAll = translations.length > 0
      && exportCodes.every(code => Object.prototype.hasOwnProperty.call(translations[0].translations, code));
    if (hasAll) return translations;
    return getTranslationsGrid(selectedProject, exportCodes);
  }

  async function exportLanguage(langCode: string, fallbackLang: string) {
    const rows = await getExportRows([langCode], fallbackLang);
    const resolvedFallback = fallbackLang === FALLBACK_NONE ? null : fallbackLang;
    const nested: Record<string, unknown> = {};
    rows.forEach(row => {
      const targetValue = row.translations[langCode]?.value ?? null;
      const fallbackValue = resolvedFallback ? row.translations[resolvedFallback]?.value ?? null : null;
      const value = targetValue ?? fallbackValue;
      if (value != null) setNested(nested, row.key, value);
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
      const rows = await getExportRows(selectedCodes, fallbackLang);
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const resolvedFallback = fallbackLang === FALLBACK_NONE ? null : fallbackLang;

      // Precompute fallback map
      const fbMap: Record<string, string | null> = {};
      if (resolvedFallback) {
        rows.forEach(row => { fbMap[row.key] = row.translations[resolvedFallback]?.value ?? null; });
      }

      for (const code of selectedCodes) {
        const nested: Record<string, unknown> = {};
        rows.forEach(row => {
          const val = row.translations[code]?.value ?? (resolvedFallback ? fbMap[row.key] : null);
          if (val != null) setNested(nested, row.key, val);
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

  const updateFallbackMissingCount = useCallback(async (langCode: string) => {
    if (langCode === FALLBACK_NONE) {
      setFallbackMissingCount(0);
      return;
    }
    if (!selectedProject) {
      setFallbackMissingCount(0);
      return;
    }
    const hasLang = translations.length > 0
      && Object.prototype.hasOwnProperty.call(translations[0].translations, langCode);
    let rows = translations;
    if (!hasLang) {
      try {
        rows = await getTranslationsGrid(selectedProject, [langCode]);
      } catch (err) {
        console.error(err);
        setFallbackMissingCount(0);
        return;
      }
    }
    const missing = rows.reduce((acc, row) => acc + ((row.translations[langCode]?.value ?? null) == null ? 1 : 0), 0);
    setFallbackMissingCount(missing);
  }, [selectedProject, translations]);

  useEffect(() => {
    if (!isExportOpen) return;
    void updateFallbackMissingCount(exportFallbackLang);
  }, [isExportOpen, exportFallbackLang, updateFallbackMissingCount]);

  function handleDeletedKeys(keyIds: string[]) {
    if (!keyIds || keyIds.length === 0) return;
    setTranslations(prev => prev.filter(r => !keyIds.includes(r.key_id)));
    setFilteredTranslations(prev => prev.filter(r => !keyIds.includes(r.key_id)));
    const msg = `${keyIds.length} key${keyIds.length > 1 ? 's' : ''} deleted`;
    setLiveMessage(msg);
    toast({ title: 'Deleted', description: msg, variant: 'success' });
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-foreground">
        <div className="bg-surface-elevated p-8 rounded-xl shadow-card border border-border max-w-md">
          <h2 className="font-display text-2xl font-semibold text-danger mb-4">Error</h2>
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:h-14">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Image src="/chinese.svg" alt="Glotter" width={28} height={28} className="h-7 w-7" priority />
              <h1 className="font-display text-xl font-semibold tracking-tight">Glotter</h1>
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
                    {isPlatformAdmin && (
                      <>
                        <DropdownMenuItem onClick={() => setIsCreateProjectOpen(true)} className="font-medium">
                          + New project…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
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
                {selectedProject && hasProjectActions && (
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
                      {canManageMembers && (
                        <>
                          <DropdownMenuItem onClick={() => setIsManageMembersOpen(true)}>Manage members…</DropdownMenuItem>
                          {(canManageLanguages || canDeleteProject) && <DropdownMenuSeparator />}
                        </>
                      )}
                      {canManageLanguages && (
                        <DropdownMenuItem onClick={() => setIsManageLangsOpen(true)}>Manage languages…</DropdownMenuItem>
                      )}
                      {canDeleteProject && (
                        <DropdownMenuItem onClick={() => setIsDeleteProjectOpen(true)} className="text-danger focus:text-danger">Delete project…</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <ThemeToggle />
            {isPlatformAdmin && (
              <Button variant="outline" size="sm" onClick={() => setIsUserManagementOpen(true)}>
                Manage users
              </Button>
            )}
            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1 text-xs text-foreground cursor-pointer hover:bg-surface-hover hover:border-[hsl(var(--accent)/0.5)] hover:text-[hsl(var(--accent))] transition-colors group sm:max-w-[220px]"
              title="Edit profile"
            >
              <svg className="h-4 w-4 text-muted group-hover:text-[hsl(var(--accent))] transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 10-8 0 4 4 0 008 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 21a7 7 0 0116 0" />
              </svg>
              <span className="hidden sm:inline truncate">{(user.user_metadata?.display_name as string | undefined) ?? user.email}</span>
              <svg className="h-3 w-3 text-muted group-hover:text-[hsl(var(--accent))] transition-colors shrink-0 sm:ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-1.414.93l-3 1 1-3a4 4 0 01.93-1.414z" />
              </svg>
            </button>
            <Button variant="outline" size="sm" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={14} />
                  Signing out…
                </span>
              ) : (
                'Sign out'
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div aria-live="polite" aria-atomic="true" className="sr-only">{liveMessage}</div>
        {loading ? (
          <div className="space-y-4">
            <div className="bg-surface-elevated px-4 sm:px-6 py-6 rounded-xl shadow-card border border-border">
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
              {loadingCount !== null && (
                <div className="flex items-center gap-2 px-6 pb-4 text-sm text-muted">
                  <Spinner size={14} />
                  <span>
                    {loadingCount === 0
                      ? 'Loading translations…'
                      : `Loading translations… ${loadingCount.toLocaleString()} rows fetched`}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-surface-elevated p-12 rounded-xl shadow-card text-center border border-border">
            <h2 className="font-display text-3xl font-semibold tracking-tight mb-3">No Projects Found</h2>
            <p className="text-muted">
              Create a project to get started.
            </p>
            {isPlatformAdmin && (
              <div className="mt-6">
                <Button onClick={() => setIsCreateProjectOpen(true)}>+ Create project</Button>
              </div>
            )}
          </div>
        ) : !selectedProject ? (
          <div className="bg-surface-elevated p-12 rounded-xl shadow-card text-center border border-border">
            <h2 className="font-display text-3xl font-semibold tracking-tight mb-3">Select a Project</h2>
            <p className="text-muted">
              Choose a project from the dropdown above to view and manage translations.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-surface-elevated px-4 sm:px-6 py-6 rounded-xl shadow-card border border-border">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-sm font-medium text-muted">
                    <span className="text-lg font-bold">{translations.length}</span>
                    <span className="ml-1.5 label-mono text-[0.6875rem] text-muted">keys</span>
                  </div>
                  <div className="h-6 w-px bg-border"></div>
                  <div className="text-sm font-medium text-muted">
                    <span className="text-lg font-bold">{languages.length}</span>
                    <span className="ml-1.5 label-mono text-[0.6875rem] text-muted">languages</span>
                  </div>
                  {filterMode !== 'all' && (
                    <>
                      <div className="h-6 w-px bg-border"></div>
                      <div className="text-sm font-medium text-muted">
                        <span className="text-lg font-bold text-warning">{filteredTranslations.length}</span>
                        <span className="ml-1.5 label-mono text-[0.6875rem] text-muted">filtered</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <Button
                    variant="outline"
                    size="md"
                    className="gap-2 w-full sm:w-auto justify-center"
                    disabled={!canImportData}
                    onClick={() => {
                      if (!canImportData) return;
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
                    className="gap-2 w-full sm:w-auto justify-center"
                    disabled={!canUseAi}
                    onClick={() => {
                      if (!canUseAi || sortedLanguages.length === 0) return;
                      const selectedSource = sortedLanguages.find(l => l.code.toLowerCase() === 'en')?.code || sortedLanguages[0].code;
                      setAiSourceLang(selectedSource);
                      // default targets: visible languages except source with any missing values
                      const defaults = new Set<string>();
                      const visible = Array.from(visibleLanguages);
                      visible.forEach(code => {
                        if (code === selectedSource) return;
                        const hasMissing = translations.some(row => !row.translations[code]?.value);
                        if (hasMissing) defaults.add(code);
                      });
                      setAiTargets(defaults);
                      setAiGlossaryCsv('');
                      setAiPreview(null);
                      setIsAiOpen(true);
                    }}
                  >
                    <WandSparkles className="h-4 w-4" />
                    AI fill missing…
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    className="gap-2 w-full sm:w-auto justify-center"
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
                  {canAddKey && (
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
                                  await createTranslationKey(selectedProject, newKeyName.trim());
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
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="relative w-full lg:flex-1">
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

                <div className="flex flex-col sm:flex-row lg:items-center gap-2 w-full lg:w-auto">
                  <SegmentedControl
                    ariaLabel="Filter translations"
                    value={filterMode}
                    onValueChange={(v) => setFilterMode(v as 'all' | 'missing' | 'complete')}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'missing', label: 'Missing' },
                      { value: 'complete', label: 'Complete' },
                    ]}
                    className="w-full sm:w-auto"
                  />

                  {sortedLanguages.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="gap-2 w-full sm:w-auto justify-center">
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
                              const all = new Set(Array.from(allowedViewSet));
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
                        <div className="max-h-80 overflow-auto">
                          {sortedLanguages
                            .filter(lang => allowedViewSet.has(lang.code))
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
                                    if (allowedViewSet.has(lang.code)) {
                                      newVisible.add(lang.code);
                                    }
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
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>

            <TranslationGrid
              data={filteredTranslations}
              languages={gridLanguages}
              projectId={selectedProject}
              onOpenAllLanguages={openAllLanguagesPanel}
              onDeletedKeys={handleDeletedKeys}
              allowCellEditing={canEditCells && editableLanguageSet.size > 0}
              editableLanguages={editableLanguageSet}
              allowRowSelection={canManageKeys}
              allowAiActions={canUseAi}
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
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex justify-end">
        <span className="text-xs text-muted/60">v{packageJson.version}</span>
      </footer>
      {canManageMembers && (
        <ManageProjectMembersDialog
          open={isManageMembersOpen}
          onOpenChange={setIsManageMembersOpen}
          projectId={selectedProject || null}
          projectName={selectedProjectInfo?.name}
          accessToken={session?.access_token ?? null}
          availableLanguages={sortedLanguages}
        />
      )}
      {isPlatformAdmin && (
        <UserManagementDialog
          open={isUserManagementOpen}
          onOpenChange={setIsUserManagementOpen}
          accessToken={session?.access_token ?? null}
          currentUserId={user?.id ?? null}
        />
      )}
      <ChangePasswordDialog
        open={isChangePasswordOpen}
        onOpenChange={setIsChangePasswordOpen}
        currentDisplayName={(user?.user_metadata?.display_name as string | undefined) ?? null}
      />
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
                    if (canImportData) {
                      resetImportFileState();
                      setImportTargetLang(primaryLang);
                      setImportMode('merge');
                      setDeleteMissing(false);
                      setIsImportOpen(true);
                    }
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
      {/* AI Translate Dialog */}
      {canUseAi && (
        <Dialog
          open={isAiOpen}
          onOpenChange={(open) => {
            setIsAiOpen(open);
            if (!open) {
              setAiPreview(null);
              setAiGlossaryCsv('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>AI fill missing translations</DialogTitle>
              <DialogDescription>Generate suggestions for missing cells while preserving placeholders.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Source language</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="truncate">
                        {aiSourceLang.toUpperCase()} {sortedLanguages.find(l => l.code === aiSourceLang)?.name ? `(${sortedLanguages.find(l => l.code === aiSourceLang)?.name})` : ''}
                      </span>
                      <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-64 overflow-auto w-64">
                    {sortedLanguages.map(l => (
                      <DropdownMenuItem key={l.code} onClick={() => setAiSourceLang(l.code)}>
                        <span className="font-medium">{l.code.toUpperCase()}</span>
                        {l.name && <span className="text-xs text-muted ml-2">({l.name})</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Target languages</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto border border-border rounded-md p-2">
                  {sortedLanguages.map(l => {
                    const checked = aiTargets.has(l.code);
                    const disabled = l.code === aiSourceLang;
                    return (
                      <label key={l.code} className={`inline-flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(aiTargets);
                            if (e.target.checked) next.add(l.code); else next.delete(l.code);
                            setAiTargets(next);
                          }}
                        />
                        <span className="font-medium">{l.code.toUpperCase()}</span>
                        {l.name && <span className="text-xs text-muted">({l.name})</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Glossary (CSV: source,target)</label>
              <textarea
                value={aiGlossaryCsv}
                onChange={(e) => setAiGlossaryCsv(e.target.value)}
                placeholder="Sign in,Se connecter\nHome,Accueil"
                className="w-full p-2 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                rows={3}
              />
              <p className="text-xs text-muted mt-1">Authoritative mapping; placeholders are always preserved.</p>
            </div>

            {aiChunking?.running && (
              <div className="flex items-center justify-between text-sm border border-border rounded-md p-2 bg-surface">
                <div>
                  Processing {aiChunking.processed} / {aiChunking.total}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-40 h-2 bg-surface-hover rounded">
                    <div className="h-2 bg-[hsl(var(--accent))] rounded" style={{ width: `${Math.round((aiChunking.processed / Math.max(1, aiChunking.total)) * 100)}%` }} />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { aiCancelRef.current.cancelled = true; aiCancelRef.current.controller?.abort(); }}>Cancel</Button>
                </div>
              </div>
            )}

            {!aiPreview ? (
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setIsAiOpen(false)} disabled={aiBusy}>Cancel</Button>
                <Button
                  onClick={async () => {
                    if (!selectedProject) return;
                    const targets = Array.from(aiTargets);
                    if (targets.length === 0) {
                      toast({ title: 'Select targets', description: 'Choose at least one target language.', variant: 'error' });
                      return;
                    }
                    try {
                      setAiBusy(true);
                      // Collect entries with a source value and at least one selected target missing
                      const adjusted = filteredTranslations
                        .filter(row => {
                          const src = row.translations[aiSourceLang]?.value || '';
                          if (!src) return false;
                          return targets.some(lang => !(row.translations[lang]?.value));
                        })
                        .map(row => ({ key: row.key, text: row.translations[aiSourceLang]!.value as string }));
                      if (adjusted.length === 0) {
                        toast({ title: 'Nothing to translate', description: 'No rows have source text with missing targets.', variant: 'info' });
                        setAiBusy(false);
                        return;
                      }
                      // Per-run cap and chunked processing
                      const cap = Number(process.env.NEXT_PUBLIC_AI_PREVIEW_CAP || 500);
                      const chunkSize = Number(process.env.NEXT_PUBLIC_AI_CHUNK_SIZE || 50);
                      const limited = adjusted.slice(0, cap);
                      if (adjusted.length > cap) {
                        toast({ title: 'Preview limited', description: `Showing first ${cap} rows. Apply in chunks.`, variant: 'info' });
                      }
                      aiCancelRef.current.cancelled = false;
                      setAiChunking({ running: true, processed: 0, total: limited.length });
                      const aggregate: Record<string, AiSuggestedTranslation[]> = {};
                      const glossary = aiGlossaryCsv
                        .split('\n').map(l => l.trim()).filter(Boolean)
                        .map(line => { const [source, target] = line.split(','); return { source: (source || '').trim(), target: (target || '').trim() }; })
                        .filter(t => t.source && t.target);
                      for (let i = 0; i < limited.length; i += chunkSize) {
                        if (aiCancelRef.current.cancelled) break;
                        const chunk = limited.slice(i, i + chunkSize);
                        const controller = new AbortController();
                        aiCancelRef.current.controller = controller;
                        const res = await fetch('/api/ai-translate', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            projectId: selectedProject,
                            sourceLanguage: aiSourceLang,
                            targetLanguages: targets,
                            entries: chunk,
                            options: { glossary, preservePlaceholders: true, dryRun: true },
                          }),
                          signal: controller.signal,
                        });
                        if (!res.ok) throw new Error(await res.text());
                        const json = (await res.json()) as AiTranslateResponseBody;
                        Object.entries(json.translations).forEach(([lang, list]) => {
                          if (!aggregate[lang]) aggregate[lang] = [];
                          aggregate[lang].push(...list);
                        });
                        setAiChunking({ running: true, processed: Math.min(i + chunk.length, limited.length), total: limited.length });
                        aiCancelRef.current.controller = null;
                      }
                      if (aiCancelRef.current.cancelled) {
                        toast({ title: 'Cancelled', description: 'Generation cancelled.', variant: 'info' });
                      }
                      setAiPreview(aggregate);
                      setAiChunking(null);
                    } catch (e) {
                      console.error(e);
                      toast({ title: 'AI preview failed', description: 'Could not generate suggestions.', variant: 'error' });
                    } finally {
                      setAiBusy(false);
                    }
                  }}
                  disabled={aiBusy || aiTargets.size === 0}
                >
                  {aiBusy ? 'Generating…' : 'Generate preview'}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-h-80 overflow-auto border border-border rounded-md">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-hover">
                        <th className="text-left px-3 py-2">Key</th>
                        <th className="text-left px-3 py-2">Source</th>
                        {Object.keys(aiPreview).map(lang => (
                          <th key={lang} className="text-left px-3 py-2">{lang.toUpperCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTranslations.map(row => {
                        const source = row.translations[aiSourceLang]?.value || '';
                        const anyMissing = Object.keys(aiPreview!).some(lang => !(row.translations[lang]?.value));
                        if (!anyMissing) return null;
                        return (
                          <tr key={row.key} className="border-t border-border">
                            <td className="px-3 py-2 font-medium">{row.key}</td>
                            <td className="px-3 py-2 text-muted">{source || '—'}</td>
                            {Object.entries(aiPreview!).map(([lang, items]) => {
                              const found = items.find(i => i.key === row.key);
                              const err = found?.error;
                              const suggested = found?.aiText || '';
                              const already = row.translations[lang]?.value || '';
                              return (
                                <td key={lang} className="px-3 py-2">
                                  {already ? (
                                    <span className="text-muted">(existing)</span>
                                  ) : err ? (
                                    <span className="text-danger text-xs">{err}</span>
                                  ) : (
                                    <span>{suggested || '—'}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAiPreview(null)} disabled={aiBusy}>Back</Button>
                  <Button
                    onClick={async () => {
                      if (!selectedProject || !aiPreview) return;
                      try {
                        setAiBusy(true);
                        // Build entries from preview only for missing cells
                        const entries: Array<{ key: string; langCode: string; value: string | null }> = [];
                        filteredTranslations.forEach(row => {
                          for (const [lang, items] of Object.entries(aiPreview)) {
                            const already = row.translations[lang]?.value || '';
                            if (already) continue;
                            const found = items.find(i => i.key === row.key);
                            if (found && !found.error && found.aiText) {
                              entries.push({ key: row.key, langCode: lang, value: found.aiText });
                            }
                          }
                        });
                        if (entries.length === 0) {
                          toast({ title: 'Nothing to apply', description: 'No valid suggestions to write.', variant: 'info' });
                          return;
                        }
                        await bulkUpsertTranslations(selectedProject, entries);
                        await loadProjectData(selectedProject);
                        setIsAiOpen(false);
                        setAiPreview(null);
                        toast({ title: 'Applied', description: `Wrote ${entries.length} suggestions.`, variant: 'success' });
                      } catch (e) {
                        console.error(e);
                        toast({ title: 'Apply failed', description: 'Failed to write AI suggestions.', variant: 'error' });
                      } finally {
                        setAiBusy(false);
                      }
                    }}
                    disabled={aiBusy}
                  >
                    {aiBusy ? 'Applying…' : 'Apply suggestions'}
                  </Button>
                </div>
              </div>
            )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Manage Languages Dialog */}
      {canManageLanguages && (
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
                    if (canImportData) {
                      resetImportFileState();
                      setImportTargetLang(code.toLowerCase());
                      setImportMode('merge');
                      setDeleteMissing(false);
                      setIsImportOpen(true);
                    }
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

            <div className="border border-border rounded-lg divide-y divide-border max-h-80 overflow-auto">
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
                      variant="destructiveGhost"
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
      )}

      {/* Delete Project Dialog */}
      {canDeleteProject && (
        <Dialog open={isDeleteProjectOpen} onOpenChange={setIsDeleteProjectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete project</DialogTitle>
              <DialogDescription>
                This will delete the project and all keys and translations. Only project owners can perform this action. Type the project name to confirm.
              </DialogDescription>
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
                    setProjectMembership(null);
                    setLanguages([]);
                    setTranslations([]);
                    setFilteredTranslations([]);
                    setIsDeleteProjectOpen(false);
                    setConfirmProjectName('');
                    toast({ title: 'Project deleted', description: `${proj.name} deleted`, variant: 'success' });
                  } catch (err) {
                    console.error(err);
                    const message = err instanceof Error ? err.message : 'Failed to delete project';
                    toast({ title: 'Error', description: message, variant: 'error' });
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
      )}

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
                      {exportFallbackLang === FALLBACK_NONE
                        ? 'No fallback (skip missing)'
                        : `${exportFallbackLang.toUpperCase()}${sortedLanguages.find(l => l.code === exportFallbackLang)?.name ? ` (${sortedLanguages.find(l => l.code === exportFallbackLang)?.name})` : ''}`}
                    </span>
                    <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-auto w-64">
                  <DropdownMenuItem
                    onClick={() => {
                      setExportFallbackLang(FALLBACK_NONE);
                      setFallbackMissingCount(0);
                    }}
                  >
                    <span className="font-medium">No fallback</span>
                    <span className="text-xs text-muted ml-2">(skip missing)</span>
                  </DropdownMenuItem>
                  {sortedLanguages.map(l => (
                    <DropdownMenuItem key={l.code} onClick={() => {
                      setExportFallbackLang(l.code);
                      void updateFallbackMissingCount(l.code);
                    }}>
                      <span className="font-medium">{l.code.toUpperCase()}</span>
                      {l.name && <span className="text-xs text-muted ml-2">({l.name})</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {exportFallbackLang !== FALLBACK_NONE && fallbackMissingCount > 0 && (
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
              <Button variant="outline" onClick={() => setIsExportOpen(false)} disabled={exportBusy}>Cancel</Button>
              <Button
                onClick={async () => {
                  const selected = Array.from(exportSelected);
                  if (selected.length === 0) return;
                  try {
                    setExportBusy(true);
                    if (selected.length === 1) {
                      await exportLanguage(selected[0], exportFallbackLang);
                    } else {
                      // zip only selected languages
                      await exportAllLanguagesZip(selected, exportFallbackLang);
                    }
                    setIsExportOpen(false);
                  } catch (e) {
                    console.error(e);
                    toast({ title: 'Export failed', description: 'Failed to create ZIP export.', variant: 'error' });
                  } finally {
                    setExportBusy(false);
                  }
                }}
                disabled={exportSelected.size === 0 || exportBusy}
              >
                {exportBusy ? 'Exporting…' : 'Export'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Import JSON Dialog */}
      {canImportData && (
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
                        // Flatten then decode \uXXXX in all string leaves (including nested)
                        const flat = toKeyToValueMap(json as Record<string, unknown>);
                        for (const k of Object.keys(flat)) {
                          if (typeof flat[k] === 'string') flat[k] = decodeUnicodeEscapes(flat[k]!);
                        }
                        map = flat;
                      } else if (Array.isArray(json)) {
                        const tmp: Record<string, unknown> = {};
                        const targetLangLower = importTargetLang.toLowerCase();
                        json.forEach(rec => {
                          if (!isImportArrayRecord(rec)) return;
                          const langMatch = rec.lang == null || String(rec.lang).toLowerCase() === targetLangLower;
                          if (!langMatch) return;
                          const rawValue = rec.value;
                          tmp[rec.key] = typeof rawValue === 'string' ? decodeUnicodeEscapes(rawValue) : rawValue;
                        });
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
      )}
    </div>
  );
}
