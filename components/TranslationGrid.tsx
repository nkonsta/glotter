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

  const totalPages = Math.ceil(tableData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = useMemo(() => tableData.slice(startIndex, endIndex), [tableData, startIndex, endIndex]);

  // Update tableData when data prop changes (from filtering/searching)
  useEffect(() => {
    setTableData(data);
    setCurrentPage(1); // Reset to first page when data changes
  }, [data]);

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
    columnHelper.accessor('key', {
      header: 'Key',
      cell: info => (
        <div className="font-mono text-xs font-semibold text-gray-900 bg-gray-50 px-3 py-2 rounded-md min-w-[180px] max-w-[220px] break-words border-l-4 border-blue-500">
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
              <div className="font-bold text-gray-900">{lang.code.toUpperCase()}</div>
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
                    className="w-full p-2.5 text-sm border-2 border-blue-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    rows={3}
                  />
                ) : (
                  <div
                    onClick={() => handleCellClick(actualRowIndex, langCode)}
                    className={`p-2.5 text-sm cursor-pointer rounded-md transition-colors min-h-[44px] ${
                      !value
                        ? 'bg-red-50 border-2 border-red-200 hover:bg-red-100'
                        : 'hover:bg-blue-50 border border-transparent hover:border-blue-200'
                    }`}
                  >
                    {value || <span className="text-gray-400 italic text-xs">Click to add translation</span>}
                  </div>
                )}
              </div>
            );
          },
        }
      )
    ),
  ], [languages, startIndex]);

  const table = useReactTable({
    data: paginatedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-md">
      <table className="w-full border-collapse">
        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-10">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className="px-4 py-4 text-left text-sm font-semibold text-gray-700 border-b-2 border-gray-300 border-r border-gray-200 last:border-r-0"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {table.getRowModel().rows.map((row, idx) => (
            <tr key={row.id} className={`transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30`}>
              {row.getVisibleCells().map(cell => (
                <td
                  key={cell.id}
                  className="px-4 py-3 border-r border-gray-100 last:border-r-0 align-top"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {tableData.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <div className="text-lg font-medium mb-2">No translation keys found</div>
          <div className="text-sm">Add your first key to get started.</div>
        </div>
      )}

      {tableData.length > 0 && (
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
              <span className="font-semibold">{Math.min(endIndex, tableData.length)}</span> of{' '}
              <span className="font-semibold">{tableData.length}</span> keys
            </div>

            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={200}>200 per page</option>
              </select>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  «
                </button>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  ‹
                </button>

                <span className="px-4 py-1.5 text-sm font-medium text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  ›
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
