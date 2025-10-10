'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Languages } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface TranslationGridProps {
  data: TranslationRow[];
  languages: Array<{ code: string; name: string | null }>;
  onOpenAllLanguages?: (rowIndex: number) => void;
  onDeletedKeys?: (keyIds: string[]) => void;
}

export default function TranslationGrid({ data, languages, onOpenAllLanguages, onDeletedKeys }: TranslationGridProps) {
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

  const toggleRowSelection = (rowIndex: number) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(rowIndex)) {
      newSelection.delete(rowIndex);
    } else {
      newSelection.add(rowIndex);
    }
    setSelectedRows(newSelection);
  };

  // Range selection removed

  const toggleAllRows = () => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
    } else {
      const allIndices = paginatedData.map((_, idx) => startIndex + idx);
      setSelectedRows(new Set(allIndices));
    }
  };

  const handleCellClick = useCallback((actualRowIndex: number, langCode: string) => {
    setEditingCell({ row: actualRowIndex, col: langCode });
  }, []);

  const handleSave = useCallback(async (actualRowIndex: number, langCode: string, newValue: string) => {
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
  }, [tableData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, langCode: string, currentValue: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave(rowIndex, langCode, currentValue);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }, [handleSave]);

  const columnHelper = createColumnHelper<TranslationRow>();

  const columns = useMemo(() => [
    // Checkbox column
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
    }),
    // Key column
    columnHelper.accessor('key', {
      header: 'Key',
      cell: info => {
        const displayRowIndex = info.row.index;
        const actualRowIndex = startIndex + displayRowIndex;
        return (
          <div className="group/ky flex items-center justify-between gap-2 min-w-[180px] max-w-[240px]">
            <div className="font-medium text-foreground tracking-tight text-sm break-words">
              {info.getValue()}
            </div>
            {onOpenAllLanguages && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onOpenAllLanguages(actualRowIndex)}
                      className="opacity-0 group-hover/ky:opacity-100 transition-opacity text-muted hover:text-foreground"
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
        );
      },
    }),
    ...languages.map(lang =>
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
            // Focus management removed

            return (
              <div className="min-w-[250px] max-w-[400px]">
                {isEditing ? (
                  <CellEditor
                    key={`${actualRowIndex}-${langCode}`}
                    initialValue={value || ''}
                    onCancel={() => setEditingCell(null)}
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
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-foreground flex-1">{value}</div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 flex-shrink-0">
                          <svg className="w-4 h-4 text-muted hover:text-foreground transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          },
        }
      )
    ),
  ], [
    languages,
    startIndex,
    selectedRows,
    paginatedData.length,
    handleCellClick,
    handleKeyDown,
    handleSave,
    tableData,
    toggleAllRows,
    toggleRowSelection,
    editingCell?.row,
    editingCell?.col,
    columnHelper,
  ]);

  const table = useReactTable({
    data: paginatedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  function CellEditor({ initialValue, onCommit, onCancel, onKeyDown }: { initialValue: string; onCommit: (v: string) => void; onCancel: () => void; onKeyDown: (e: React.KeyboardEvent, v: string) => void }) {
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
    setDeleteDialogOpen(true);
  };

  async function confirmBulkDelete() {
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

  function openRename(rowIndex: number) {
    const currentKey = tableData[rowIndex]?.key || '';
    setRenameDialog({ open: true, rowIndex, value: currentKey });
  }

  async function confirmRename() {
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
      {selectedRows.size > 0 && (
        <div className="bg-primary-soft border border-primary/40 rounded-lg px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-2">
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
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-surface-elevated shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header, idx) => {
                  const isCheckbox = idx === 0;
                  const isKeyColumn = idx === 1;
                  return (
                    <th
                      key={header.id}
                      className={`py-3 text-left text-xs font-medium uppercase text-muted tracking-wide whitespace-normal ${
                        isCheckbox ? 'sticky left-0 z-10 bg-surface-elevated px-4 w-16' :
                        isKeyColumn ? 'sticky z-10 bg-surface-elevated px-4' : 'px-4'
                      }`}
                      style={isKeyColumn ? { left: '4rem' } : undefined}
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
              const isSelected = selectedRows.has(actualRowIndex);
              return (
                <tr
                  key={row.id}
                  data-selected={isSelected}
          className={`group transition-all duration-150 ease-out h-14 hover:bg-surface-hover/70 hover:shadow-sm ${
                    isSelected ? 'bg-primary-soft border-l-4 border-l-primary' : ''
                  }`}
                  
                >
                  {row.getVisibleCells().map((cell, cellIdx) => {
                    const isCheckbox = cellIdx === 0;
                    const isKeyColumn = cellIdx === 1;
                    return (
                      <td
                        key={cell.id}
                        className={`py-3 px-4 text-sm whitespace-normal align-top text-foreground ${
                          isCheckbox ? 'sticky left-0 z-10 bg-inherit w-16' :
                          isKeyColumn ? 'sticky z-10 bg-inherit' : ''
                        }`}
                        style={isKeyColumn ? { left: '4rem' } : undefined}
                      >
                        {isKeyColumn ? (
                          <div className="group/ky flex items-center justify-between gap-2 min-w-[180px] max-w-[240px]">
                            <div className="font-medium text-foreground tracking-tight text-sm break-words">
                              {row.getValue('key') as string}
                            </div>
                            <div className="opacity-0 group-hover/ky:opacity-100 transition-opacity flex items-center gap-2">
                              <button
                                className="text-muted hover:text-foreground transition-colors"
                                onClick={() => openRename(actualRowIndex)}
                                aria-label="Rename key"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            </div>
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
        <div className="border-t border-border px-6 py-4 bg-surface">
          <div className="flex items-center justify-between">
                <div className="text-sm text-muted">
                  <span className="font-medium text-foreground">{startIndex + 1}</span>
                  <span className="mx-1 text-muted">-</span>
                  <span className="font-medium text-foreground">{Math.min(endIndex, tableData.length)}</span>
                  <span className="mx-1 text-muted">of</span>
                  <span className="font-medium text-foreground">{tableData.length}</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowPageSizeMenu(!showPageSizeMenu)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm bg-surface hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground font-medium min-w-[70px]"
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
                      {[25, 50, 100, 200].map((size) => (
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

              <div className="flex items-center gap-1">
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
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected keys</DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedRows.size} key(s) and their translations. This action cannot be undone.
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

      {/* Rename Dialog */}
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
    </div>
  );
}
