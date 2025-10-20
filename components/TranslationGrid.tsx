'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  ColumnDef,
} from '@tanstack/react-table';
import { TranslationRow } from '@/lib/supabase';
import { updateTranslation, createTranslation, renameTranslationKey, deleteTranslationKeys } from '@/lib/translations';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/Tooltip';
import { Languages, WandSparkles } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface TranslationGridProps {
  data: TranslationRow[];
  languages: Array<{ code: string; name: string | null }>;
  onOpenAllLanguages?: (rowIndex: number) => void;
  onDeletedKeys?: (keyIds: string[]) => void;
  allowCellEditing: boolean;
  allowRowSelection: boolean;
  allowRename: boolean;
  allowAiActions: boolean;
}

export default function TranslationGrid({ data, languages, onOpenAllLanguages, onDeletedKeys, allowCellEditing, allowRowSelection, allowRename, allowAiActions }: TranslationGridProps) {
  const { toast } = useToast();
  const [tableData, setTableData] = useState(data);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [showPageSizeMenu, setShowPageSizeMenu] = useState(false);
  // Keyboard nav removed; keep simple click-to-edit
  // Shift-click range selection removed
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; rowIndex: number | null; value: string }>({ open: false, rowIndex: null, value: '' });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Per-row AI dialog state
  const [aiDialog, setAiDialog] = useState<{ open: boolean; rowIndex: number | null }>(() => ({ open: false, rowIndex: null }));
  const [aiSourceLang, setAiSourceLang] = useState<string>('en');
  const [aiTargets, setAiTargets] = useState<Set<string>>(new Set());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<Record<string, string> | null>(null); // lang -> suggestion

  useEffect(() => {
    if (!allowRowSelection) {
      setSelectedRows(new Set());
      setDeleteDialogOpen(false);
    }
  }, [allowRowSelection]);

  useEffect(() => {
    if (!allowRename) {
      setRenameDialog({ open: false, rowIndex: null, value: '' });
    }
  }, [allowRename]);

  useEffect(() => {
    if (!allowCellEditing) {
      setEditingCell(null);
      setAiDialog({ open: false, rowIndex: null });
      setAiPreview(null);
    }
  }, [allowCellEditing]);

  const totalPages = Math.ceil(tableData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = useMemo(() => tableData.slice(startIndex, endIndex), [tableData, startIndex, endIndex]);

  // Update tableData when data prop changes (from filtering/searching)
  useEffect(() => {
    setTableData(data);
    setCurrentPage(1); // Reset to first page when data changes
    setSelectedRows(new Set()); // Clear selection when data changes
  }, [data]);

  // Keyboard navigation logic removed

  const toggleRowSelection = useCallback((rowIndex: number) => {
    if (!allowRowSelection) return;
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, [allowRowSelection]);

  // Range selection removed

  const toggleAllRows = useCallback(() => {
    if (!allowRowSelection) return;
    setSelectedRows(prev => {
      if (prev.size === paginatedData.length) {
        return new Set();
      }
      const allIndices = paginatedData.map((_, idx) => startIndex + idx);
      return new Set(allIndices);
    });
  }, [allowRowSelection, paginatedData, startIndex]);

  const handleCellClick = useCallback((actualRowIndex: number, langCode: string) => {
    if (!allowCellEditing) return;
    setEditingCell({ row: actualRowIndex, col: langCode });
  }, [allowCellEditing]);

  const handleSave = useCallback(async (actualRowIndex: number, langCode: string, newValue: string) => {
    if (!allowCellEditing) return;
    const row = tableData[actualRowIndex];
    const translation = row.translations[langCode];

    try {
      if (translation.translation_id) {
        // Update existing translation
        await updateTranslation(translation.translation_id, newValue);
      } else {
        // Create new translation
        await createTranslation(row.key_id, translation.language_id, newValue);
      }

      // Update local state
      const newData = [...tableData];
      newData[actualRowIndex] = {
        ...row,
        translations: {
          ...row.translations,
          [langCode]: {
            ...translation,
            value: newValue
          }
        }
      };
      setTableData(newData);
      setEditingCell(null);
    } catch (error) {
      console.error('Failed to save translation:', error);
      toast({ title: 'Save failed', description: 'Failed to save translation. Please try again.', variant: 'error' });
    }
  }, [allowCellEditing, tableData, toast]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>, rowIndex: number, langCode: string, currentValue: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave(rowIndex, langCode, currentValue);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }, [handleSave]);

  const columnHelper = createColumnHelper<TranslationRow>();

  const openRename = useCallback((rowIndex: number) => {
    if (!allowRename) return;
    const currentKey = tableData[rowIndex]?.key || '';
    setRenameDialog({ open: true, rowIndex, value: currentKey });
  }, [allowRename, tableData]);

  const canUseAiRow = allowAiActions;

  const columns = useMemo(() => {
    const colDefs: ColumnDef<TranslationRow, unknown>[] = [];

    if (allowRowSelection) {
      colDefs.push(
        columnHelper.display({
          id: 'select',
          header: () => (
            <input
              type="checkbox"
              checked={selectedRows.size === paginatedData.length && paginatedData.length > 0}
              onChange={toggleAllRows}
              aria-label="Select all rows"
              className="w-4 h-4 text-primary border border-border rounded focus:ring-2 focus:ring-primary cursor-pointer bg-surface"
            />
          ),
          cell: info => {
            const displayRowIndex = info.row.index;
            const actualRowIndex = startIndex + displayRowIndex;
            return (
              <input
                type="checkbox"
                checked={selectedRows.has(actualRowIndex)}
                onChange={() => toggleRowSelection(actualRowIndex)}
                aria-label={`Select row ${tableData[actualRowIndex]?.key}`}
                className="w-4 h-4 text-primary border border-border rounded focus:ring-2 focus:ring-primary cursor-pointer bg-surface"
              />
            );
          },
        })
      );
    }

    colDefs.push(
      columnHelper.accessor('key', {
        id: 'key',
        header: 'Key',
        cell: info => {
          const displayRowIndex = info.row.index;
          const actualRowIndex = startIndex + displayRowIndex;
          return (
            <div className="group/ky flex items-center justify-between gap-2 min-w-[140px] sm:min-w-[180px] max-w-[220px] sm:max-w-[240px]">
              <div className="font-medium text-foreground tracking-tight text-sm break-words">
                {info.getValue()}
              </div>
              {(allowRename || onOpenAllLanguages) && (
                <div className="opacity-100 sm:opacity-0 sm:group-hover/ky:opacity-100 transition-opacity flex items-center gap-2">
                  {allowRename && (
                    <button
                      className="text-muted hover:text-foreground transition-colors"
                      onClick={() => openRename(actualRowIndex)}
                      aria-label="Rename key"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}
                  {onOpenAllLanguages && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => onOpenAllLanguages(actualRowIndex)}
                            className="text-muted hover:text-foreground transition-colors"
                            aria-label="Edit all languages for this key"
                          >
                            <Languages className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Edit all languages</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}
            </div>
          );
        },
      })
    );

    languages.forEach(lang => {
      colDefs.push(
        columnHelper.accessor(
          row => row.translations[lang.code]?.value,
          {
            id: lang.code,
            header: () => (
              <div className="text-center">
                <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{lang.code}</div>
                {lang.name && <div className="text-xs font-normal text-muted mt-0.5">{lang.name}</div>}
              </div>
            ),
            cell: info => {
              const displayRowIndex = info.row.index;
              const actualRowIndex = startIndex + displayRowIndex;
              const langCode = lang.code;
              const isEditing = editingCell?.row === actualRowIndex && editingCell?.col === langCode;
              const value = info.getValue();

              if (!allowCellEditing) {
                const isMissing = !value;
                return (
                  <div className="min-w-[180px] sm:min-w-[240px] max-w-[260px] sm:max-w-[400px]">
                    <div
                      className={`relative p-2 text-sm rounded-md min-h-[44px] ${
                        isMissing ? 'bg-[hsl(var(--warning)/0.12)] text-warning' : ''
                      }`}
                    >
                      {isMissing ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-[hsl(var(--warning)/0.16)] text-warning">
                          Missing
                        </span>
                      ) : (
                        <div className="text-foreground flex-1">{value}</div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div className="min-w-[180px] sm:min-w-[240px] max-w-[260px] sm:max-w-[400px]">
                  {isEditing ? (
                    <CellEditor
                      key={`${actualRowIndex}-${langCode}`}
                      initialValue={value || ''}
                      onCommit={(v) => handleSave(actualRowIndex, langCode, v)}
                      onKeyDown={(e, v) => handleKeyDown(e, actualRowIndex, langCode, v)}
                    />
                  ) : (
                    <div
                      onClick={() => {
                        handleCellClick(actualRowIndex, langCode);
                      }}
                      className={`relative p-2 text-sm cursor-pointer rounded-md transition-all duration-150 ease-out min-h-[44px] ${
                        !value
                          ? 'hover:bg-[hsl(var(--warning)/0.14)]'
                          : 'hover:bg-surface-hover'
                      }`}
                    >
                      {!value ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-[hsl(var(--warning)/0.16)] text-warning">
                          Missing
                        </span>
                      ) : (
                        <div className="text-foreground flex-1">{value}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            },
          }
        )
      );
    });

    return colDefs;
  }, [
    allowCellEditing,
    allowRename,
    allowRowSelection,
    columnHelper,
    editingCell?.col,
    editingCell?.row,
    handleCellClick,
    handleKeyDown,
    handleSave,
    languages,
    onOpenAllLanguages,
    paginatedData.length,
    selectedRows,
    startIndex,
    tableData,
    toggleAllRows,
    toggleRowSelection,
    openRename,
    allowAiActions,
  ]);

  const table = useReactTable({
    data: paginatedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function CellEditor({ initialValue, onCommit, onKeyDown }: { initialValue: string; onCommit: (v: string) => void; onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, v: string) => void }) {
    const [localValue, setLocalValue] = useState(initialValue);
    return (
      <textarea
        autoFocus
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onBlur={() => onCommit(localValue)}
        onKeyDown={e => onKeyDown(e, localValue)}
        className="w-full p-2 text-sm border-2 border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary resize-none"
        rows={3}
      />
    );
  }

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleBulkDelete = () => {
    if (!allowRowSelection) return;
    setDeleteDialogOpen(true);
  };

  async function confirmBulkDelete() {
    if (!allowRowSelection) return;
    const keyIds = Array.from(selectedRows).map(idx => tableData[idx]?.key_id).filter(Boolean) as string[];
    try {
      setSubmitting(true);
      await deleteTranslationKeys(keyIds);
      // Optimistic local update
      const newData = tableData.filter((_, idx) => !selectedRows.has(idx));
      setTableData(newData);
      setSelectedRows(new Set());
      // Notify parent to refresh counts and filters
      onDeletedKeys?.(keyIds);
      setDeleteDialogOpen(false);
    } catch (e) {
      console.error(e);
      setDeleteDialogOpen(false);
      toast({ title: 'Delete failed', description: 'Failed to delete selected keys', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRename() {
    if (!allowRename) {
      setRenameDialog({ open: false, rowIndex: null, value: '' });
      return;
    }
    if (renameDialog.rowIndex == null) return;
    const row = tableData[renameDialog.rowIndex];
    const newKey = renameDialog.value.trim();
    if (!newKey || newKey === row.key) {
      setRenameDialog({ open: false, rowIndex: null, value: '' });
      return;
    }
    // Validate: no duplicates
    if (tableData.some((r, i) => i !== renameDialog.rowIndex && r.key === newKey)) {
      alert('A key with that name already exists.');
      return;
    }
    try {
      setSubmitting(true);
      await renameTranslationKey(row.key_id, newKey);
      const next = [...tableData];
      next[renameDialog.rowIndex] = { ...row, key: newKey };
      setTableData(next);
      setRenameDialog({ open: false, rowIndex: null, value: '' });
      toast({ title: 'Key renamed', description: 'The key name has been updated.', variant: 'success' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Rename failed', description: 'Failed to rename key', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  const handleBulkExport = () => {
    if (!allowRowSelection) return;
    const selectedData = Array.from(selectedRows).map(idx => tableData[idx]);

    // Create export object with all translations for selected keys
    const exportData = selectedData.reduce((acc, row) => {
      acc[row.key] = Object.keys(row.translations).reduce((langAcc, langCode) => {
        langAcc[langCode] = row.translations[langCode].value || '';
        return langAcc;
      }, {} as Record<string, string>);
      return acc;
    }, {} as Record<string, Record<string, string>>);

    // Download as JSON
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translations-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Bulk Actions Toolbar */}
      {allowRowSelection && selectedRows.size > 0 && (
        <div className="bg-primary-soft border border-primary/40 rounded-lg px-4 sm:px-6 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-medium text-foreground">
              {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelectedRows(new Set())}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Clear selection
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkExport}
              className="px-3 py-1.5 bg-surface border border-border rounded-md text-sm font-medium text-foreground hover:bg-surface-hover transition-colors duration-150 flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 bg-danger border border-danger rounded-md text-sm font-medium text-primary-foreground hover:bg-danger/90 transition-colors duration-150 flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="w-full overflow-hidden rounded-xl bg-surface-elevated shadow-card border border-border">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-surface-elevated shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id;
                  const isCheckbox = columnId === 'select';
                  const isKeyColumn = columnId === 'key';
                  const leftValue = isKeyColumn && allowRowSelection ? '4rem' : undefined;
                  return (
                    <th
                      key={header.id}
                      className={`py-3 text-left text-xs font-medium uppercase text-muted tracking-wide whitespace-normal ${
                        isCheckbox
                          ? 'bg-surface-elevated md:sticky md:left-0 md:z-10 md:bg-surface-elevated px-3 sm:px-4 w-16'
                          : isKeyColumn
                            ? 'bg-surface-elevated md:sticky md:z-10 md:bg-surface-elevated px-3 sm:px-4'
                            : 'px-3 sm:px-4 bg-surface-elevated'
                      }`}
                      style={leftValue ? { left: leftValue } : undefined}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-surface-elevated divide-y divide-border">
            {table.getRowModel().rows.map((row, idx) => {
              const actualRowIndex = startIndex + idx;
              const isSelected = allowRowSelection && selectedRows.has(actualRowIndex);
              return (
                <tr
                  key={row.id}
                  data-selected={isSelected}
                  className={`group transition-all duration-150 ease-out h-14 hover:bg-surface-hover/70 hover:shadow-sm ${
                    isSelected ? 'bg-primary-soft border-l-4 border-l-primary' : ''
                  }`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnId = cell.column.id;
                    const isCheckbox = columnId === 'select';
                    const isKeyColumn = columnId === 'key';
                    const leftValue = isKeyColumn && allowRowSelection ? '4rem' : undefined;
                    return (
                      <td
                        key={cell.id}
                        className={`py-3 px-3 sm:px-4 text-sm whitespace-normal align-top text-foreground ${
                          isCheckbox
                            ? 'md:sticky md:left-0 md:z-10 bg-inherit w-16'
                            : isKeyColumn
                              ? 'md:sticky md:z-10 bg-inherit'
                              : ''
                        }`}
                        style={leftValue ? { left: leftValue } : undefined}
                      >
                        {isKeyColumn ? (
                          <div className="group/ky flex items-center justify-between gap-2 min-w-[140px] sm:min-w-[180px] max-w-[220px] sm:max-w-[240px]">
                            <div className="font-medium text-foreground tracking-tight text-sm break-words">
                              {row.getValue('key') as string}
                            </div>
                            {(allowRename || canUseAiRow || onOpenAllLanguages) && (
                              <div className="opacity-100 sm:opacity-0 sm:group-hover/ky:opacity-100 transition-opacity flex items-center gap-2">
                                {allowRename && (
                                  <button
                                    className="text-muted hover:text-foreground transition-colors"
                                    onClick={() => openRename(actualRowIndex)}
                                    aria-label="Rename key"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                )}
                                {canUseAiRow && (
                                  <button
                                    className="text-muted hover:text-foreground transition-colors"
                                    onClick={() => {
                                      const langs = languages;
                                      const defaultSrc = langs.find(l => l.code.toLowerCase() === 'en')?.code || (langs[0]?.code || 'en');
                                      setAiSourceLang(defaultSrc);
                                      const targets = new Set<string>();
                                      langs.forEach(l => {
                                        if (l.code === defaultSrc) return;
                                        const hasVal = tableData[actualRowIndex]?.translations[l.code]?.value;
                                        if (!hasVal) targets.add(l.code);
                                      });
                                      setAiTargets(targets);
                                      setAiPreview(null);
                                      setAiDialog({ open: true, rowIndex: actualRowIndex });
                                    }}
                                    aria-label="AI translate this row"
                                    title="AI translate this row"
                                  >
                                    <WandSparkles className="w-4 h-4" />
                                  </button>
                                )}
                                {onOpenAllLanguages && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          className="text-muted hover:text-foreground transition-colors"
                                          onClick={() => onOpenAllLanguages(actualRowIndex)}
                                          aria-label="Edit all languages for this key"
                                        >
                                          <Languages className="w-4 h-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>Edit all languages</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
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
      {tableData.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="text-lg font-medium mb-2">No translation keys found</div>
          <div className="text-sm">Add your first key to get started.</div>
        </div>
      )}

      {tableData.length > 0 && (
        <div className="border-t border-border px-4 sm:px-6 py-4 bg-surface">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted text-center md:text-left">
              <span className="font-medium text-foreground">{startIndex + 1}</span>
              <span className="mx-1 text-muted">-</span>
              <span className="font-medium text-foreground">{Math.min(endIndex, tableData.length)}</span>
              <span className="mx-1 text-muted">of</span>
              <span className="font-medium text-foreground">{tableData.length}</span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-auto">
                <button
                  onClick={() => setShowPageSizeMenu(!showPageSizeMenu)}
                  className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm bg-surface hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground font-medium min-w-[70px]"
                >
                  <span>{pageSize}</span>
                  <svg className="h-3 w-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showPageSizeMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowPageSizeMenu(false)}
                    />
                    <div className="absolute bottom-full mb-1 right-0 w-24 bg-surface-elevated rounded-lg shadow-card border border-border py-1 z-40">
                      {[25, 50, 100, 200, 500].map((size) => (
                        <button
                          key={size}
                          onClick={() => {
                            setPageSize(size);
                            setCurrentPage(1);
                            setShowPageSizeMenu(false);
                          }}
                          className={`w-full text-center px-3 py-2 text-sm transition-colors ${
                            size === pageSize
                              ? 'bg-primary-soft text-primary font-medium'
                              : 'text-muted hover:bg-surface-hover'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-center gap-1 sm:justify-end">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  aria-label="First page"
                  className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover hover:border-border-strong transition-all duration-150 text-muted"
                >
                  «
                </button>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover hover:border-border-strong transition-all duration-150 text-muted"
                >
                  ‹
                </button>

                <span className="px-3 py-1.5 text-sm font-medium text-muted min-w-[100px] text-center">
                  {currentPage} <span className="text-muted-foreground/70">of</span> {totalPages}
                </span>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover hover:border-border-strong transition-all duration-150 text-muted"
                >
                  ›
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  aria-label="Last page"
                  className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover hover:border-border-strong transition-all duration-150 text-muted"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Delete Dialog */}
      {allowRowSelection && (
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete selected keys</DialogTitle>
              <DialogDescription>
                This will permanently delete {selectedRows.size} key{selectedRows.size === 1 ? '' : 's'} and their translations. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={submitting}>Cancel</Button>
              <Button variant="destructive" onClick={confirmBulkDelete} disabled={submitting}>
                {submitting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Rename Dialog */}
      {allowRename && (
        <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog(d => ({ ...d, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename key</DialogTitle>
              <DialogDescription>Provide a new, unique key.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <input
                value={renameDialog.value}
                onChange={e => setRenameDialog(d => ({ ...d, value: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRenameDialog({ open: false, rowIndex: null, value: '' })} disabled={submitting}>Cancel</Button>
                <Button onClick={confirmRename} disabled={submitting || !renameDialog.value.trim()}>
                  {submitting ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

  {/* Per-row AI Translate Dialog */}
  {allowCellEditing && (
    <Dialog open={aiDialog.open} onOpenChange={(open) => setAiDialog(d => ({ ...d, open }))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI translate this key</DialogTitle>
          <DialogDescription>Generate suggestions for the selected row only.</DialogDescription>
        </DialogHeader>
        {aiDialog.rowIndex != null && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Source language</label>
                <select
                  value={aiSourceLang}
                  onChange={(e) => setAiSourceLang(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-sm"
                >
                  {languages.map(l => (
                    <option key={l.code} value={l.code}>{l.code.toUpperCase()} {l.name ? `(${l.name})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Target languages</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto border border-border rounded-md p-2">
                  {languages.map(l => {
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

          {!aiPreview ? (
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setAiDialog({ open: false, rowIndex: null })} disabled={aiBusy}>Cancel</Button>
              <Button
                onClick={async () => {
                  const idx = aiDialog.rowIndex!;
                  const row = tableData[idx];
                  const targets = Array.from(aiTargets);
                  if (targets.length === 0) {
                    toast({ title: 'Select targets', description: 'Choose at least one target language.', variant: 'error' });
                    return;
                  }
                  const sourceText = row.translations[aiSourceLang]?.value || '';
                  if (!sourceText) {
                    toast({ title: 'No source text', description: 'This row has no source text in the selected language.', variant: 'error' });
                    return;
                  }
                  try {
                    setAiBusy(true);
                    const res = await fetch('/api/ai-translate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        projectId: 'n/a',
                        sourceLanguage: aiSourceLang,
                        targetLanguages: targets,
                        entries: [{ key: row.key, text: sourceText }],
                        options: { preservePlaceholders: true, dryRun: true },
                      }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                    const json = await res.json();
                    const perLang = json.translations as Record<string, Array<{ key: string; aiText: string; error?: string }>>;
                    const out: Record<string, string> = {};
                    for (const [lang, arr] of Object.entries(perLang)) {
                      const item = arr.find(i => i.key === row.key);
                      if (item && !item.error && item.aiText) out[lang] = item.aiText;
                    }
                    setAiPreview(out);
                  } catch (e) {
                    console.error(e);
                    toast({ title: 'AI preview failed', description: 'Could not generate suggestion.', variant: 'error' });
                  } finally {
                    setAiBusy(false);
                  }
                }}
                disabled={aiBusy || aiTargets.size === 0}
              >
                {aiBusy ? 'Generating…' : 'Generate'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="border border-border rounded-md p-3 text-sm">
                {Object.keys(aiPreview).length === 0 ? (
                  <div className="text-muted">No valid suggestions.</div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(aiPreview).map(([lang, text]) => (
                      <div key={lang} className="flex items-start gap-3">
                        <div className="w-16 text-xs font-medium text-muted-foreground">{lang.toUpperCase()}</div>
                        <div className="flex-1">{text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAiPreview(null)} disabled={aiBusy}>Back</Button>
                <Button
                  onClick={async () => {
                    if (!aiPreview || aiDialog.rowIndex == null) return;
                    try {
                      setSubmitting(true);
                      const idx = aiDialog.rowIndex;
                      // Reuse bulk upsert via fetch to app layer
                      // Directly call update/create to minimize changes:
                      for (const [lang, val] of Object.entries(aiPreview)) {
                        const t = tableData[idx].translations[lang];
                        if (t.translation_id) {
                          await updateTranslation(t.translation_id, val);
                        } else {
                          await createTranslation(tableData[idx].key_id, t.language_id, val);
                        }
                      }
                      // Local update
                      const newData = [...tableData];
                      const row = newData[idx];
                      for (const [lang, val] of Object.entries(aiPreview)) {
                        const existing = row.translations[lang];
                        if (existing) {
                          row.translations[lang] = { ...existing, value: val };
                        }
                      }
                      setTableData(newData);
                      setAiDialog({ open: false, rowIndex: null });
                      setAiPreview(null);
                      toast({ title: 'Applied', description: 'AI suggestions applied to this row.', variant: 'success' });
                    } catch (e) {
                      console.error(e);
                      toast({ title: 'Apply failed', description: 'Failed to write AI suggestions.', variant: 'error' });
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={aiBusy}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      </DialogContent>
    </Dialog>
  )}
    </div>
  );
}
