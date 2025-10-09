'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  ColumnDef,
} from '@tanstack/react-table';
import { TranslationRow } from '@/lib/supabase';
import { updateTranslation, createTranslation } from '@/lib/translations';

interface TranslationGridProps {
  data: TranslationRow[];
  languages: Array<{ code: string; name: string | null }>;
  projectId: string;
}

export default function TranslationGrid({ data, languages, projectId }: TranslationGridProps) {
  const [tableData, setTableData] = useState(data);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [showPageSizeMenu, setShowPageSizeMenu] = useState(false);

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

  const toggleRowSelection = (rowIndex: number) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(rowIndex)) {
      newSelection.delete(rowIndex);
    } else {
      newSelection.add(rowIndex);
    }
    setSelectedRows(newSelection);
  };

  const toggleAllRows = () => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
    } else {
      const allIndices = paginatedData.map((_, idx) => startIndex + idx);
      setSelectedRows(new Set(allIndices));
    }
  };

  const handleCellClick = (actualRowIndex: number, langCode: string) => {
    const currentValue = tableData[actualRowIndex].translations[langCode]?.value || '';
    setEditValue(currentValue);
    setEditingCell({ row: actualRowIndex, col: langCode });
  };

  const handleSave = async (actualRowIndex: number, langCode: string) => {
    const row = tableData[actualRowIndex];
    const translation = row.translations[langCode];

    try {
      if (translation.translation_id) {
        // Update existing translation
        await updateTranslation(translation.translation_id, editValue);
      } else {
        // Create new translation
        await createTranslation(row.key_id, translation.language_id, editValue);
      }

      // Update local state
      const newData = [...tableData];
      newData[actualRowIndex] = {
        ...row,
        translations: {
          ...row.translations,
          [langCode]: {
            ...translation,
            value: editValue
          }
        }
      };
      setTableData(newData);
      setEditingCell(null);
    } catch (error) {
      console.error('Failed to save translation:', error);
      alert('Failed to save translation. Please try again.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, langCode: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave(rowIndex, langCode);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const columnHelper = createColumnHelper<TranslationRow>();

  const columns: ColumnDef<TranslationRow, any>[] = useMemo(() => [
    // Checkbox column
    columnHelper.display({
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={selectedRows.size === paginatedData.length && paginatedData.length > 0}
          onChange={toggleAllRows}
          aria-label="Select all rows"
          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary cursor-pointer"
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
            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary cursor-pointer"
          />
        );
      },
    }),
    // Key column
    columnHelper.accessor('key', {
      header: 'Key',
      cell: info => (
        <div className="font-medium text-gray-900 tracking-tight text-sm min-w-[180px] max-w-[220px] break-words">
          {info.getValue()}
        </div>
      ),
    }),
    ...languages.map(lang =>
      columnHelper.accessor(
        row => row.translations[lang.code]?.value,
        {
          id: lang.code,
          header: () => (
            <div className="text-center">
              <div className="font-medium text-gray-700 text-xs uppercase tracking-wide">{lang.code}</div>
              {lang.name && <div className="text-xs font-normal text-gray-500 mt-0.5">{lang.name}</div>}
            </div>
          ),
          cell: info => {
            const displayRowIndex = info.row.index;
            const actualRowIndex = startIndex + displayRowIndex;
            const langCode = lang.code;
            const isEditing = editingCell?.row === actualRowIndex && editingCell?.col === langCode;
            const value = info.getValue() as string | null;

            return (
              <div className="min-w-[250px] max-w-[400px]">
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => handleSave(actualRowIndex, langCode)}
                    onKeyDown={e => handleKeyDown(e, actualRowIndex, langCode)}
                    className="w-full p-2 text-sm border-2 border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary resize-none"
                    rows={3}
                  />
                ) : (
                  <div
                    onClick={() => handleCellClick(actualRowIndex, langCode)}
                    className={`relative p-2 text-sm cursor-pointer rounded-md transition-all duration-150 ease-out min-h-[44px] ${
                      !value
                        ? 'hover:bg-amber-50/50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {!value ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-600">
                        Missing
                      </span>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-gray-700 flex-1">{value}</div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 flex-shrink-0">
                          <svg className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          <svg className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
  ], [languages, startIndex, selectedRows, paginatedData.length]);

  const table = useReactTable({
    data: paginatedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedRows.size} translation key(s)?`)) return;

    const newData = tableData.filter((_, idx) => !selectedRows.has(idx));
    setTableData(newData);
    setSelectedRows(new Set());
    // TODO: Implement actual API call to delete from Supabase
  };

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
        <div className="bg-primary/10 border border-primary/30 rounded-lg px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-900">
              {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelectedRows(new Set())}
              className="text-sm text-muted hover:text-gray-900 transition-colors"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkExport}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-150 flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 bg-danger border border-danger rounded-md text-sm font-medium text-white hover:bg-red-600 transition-colors duration-150 flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="w-full overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-gray-200">
                {headerGroup.headers.map((header, idx) => {
                  const isCheckbox = idx === 0;
                  const isKeyColumn = idx === 1;
                  return (
                    <th
                      key={header.id}
                      className={`py-3 text-left text-xs font-medium uppercase text-gray-500 tracking-wide whitespace-normal ${
                        isCheckbox ? 'sticky left-0 z-10 bg-white px-4 w-16' :
                        isKeyColumn ? 'sticky z-10 bg-white px-4' : 'px-4'
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
          <tbody className="bg-white divide-y divide-gray-100">
            {table.getRowModel().rows.map((row, idx) => {
              const actualRowIndex = startIndex + idx;
              const isSelected = selectedRows.has(actualRowIndex);
              return (
                <tr
                  key={row.id}
                  data-selected={isSelected}
                  className={`group transition-all duration-150 ease-out h-14 hover:bg-gray-50 hover:shadow-sm ${
                    isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                >
                  {row.getVisibleCells().map((cell, cellIdx) => {
                    const isCheckbox = cellIdx === 0;
                    const isKeyColumn = cellIdx === 1;
                    return (
                      <td
                        key={cell.id}
                        className={`py-3 px-4 text-sm whitespace-normal align-top ${
                          isCheckbox ? 'sticky left-0 z-10 bg-inherit w-16' :
                          isKeyColumn ? 'sticky z-10 bg-inherit' : ''
                        }`}
                        style={isKeyColumn ? { left: '4rem' } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{startIndex + 1}</span>
              <span className="text-gray-500 mx-1">-</span>
              <span className="font-medium text-gray-900">{Math.min(endIndex, tableData.length)}</span>
              <span className="text-gray-500 mx-1">of</span>
              <span className="font-medium text-gray-900">{tableData.length}</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowPageSizeMenu(!showPageSizeMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-gray-700 font-medium min-w-[70px]"
                >
                  <span>{pageSize}</span>
                  <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showPageSizeMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowPageSizeMenu(false)}
                    />
                    <div className="absolute bottom-full mb-1 right-0 w-24 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-40">
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
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-700 hover:bg-gray-50'
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
                  className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 text-gray-700"
                >
                  «
                </button>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 text-gray-700"
                >
                  ‹
                </button>

                <span className="px-3 py-1.5 text-sm font-medium text-gray-700 min-w-[100px] text-center">
                  {currentPage} <span className="text-gray-400">of</span> {totalPages}
                </span>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 text-gray-700"
                >
                  ›
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  aria-label="Last page"
                  className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 text-gray-700"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
