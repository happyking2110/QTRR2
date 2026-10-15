'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  renderSubComponent?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  renderSubComponent,
  onRowClick,
  emptyMessage = 'Không có dữ liệu',
  className,
}: DataTableProps<T>) {
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const toggleRow = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-text-muted bg-surface rounded-card border border-border">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-card border border-border bg-surface shadow-sm max-w-full min-w-0', className)}>
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-bg-tint text-text-muted text-xs uppercase tracking-wider border-b border-border">
          <tr>
            {renderSubComponent && <th scope="col" className="w-10 px-3 py-3" />}
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={cn('px-4 py-3 font-semibold', col.headerClassName)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {data.map((row, idx) => {
            const key = keyExtractor(row);
            const isExpanded = !!expandedKeys[key];

            return (
              <React.Fragment key={key}>
                <tr
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'transition-colors hover:bg-bg-tint/60',
                    onRowClick && 'cursor-pointer',
                    isExpanded && 'bg-bg-tint/30',
                  )}
                >
                  {renderSubComponent && (
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => toggleRow(key, e)}
                        className="p-1 rounded hover:bg-border/60 text-text-muted transition-colors focus:outline-none focus:ring-1 focus:ring-brand-bright"
                        aria-label={isExpanded ? 'Thu gọn hàng' : 'Mở rộng hàng'}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn('px-4 py-3 text-text align-middle', col.className)}
                    >
                      {col.cell(row, idx)}
                    </td>
                  ))}
                </tr>
                {renderSubComponent && isExpanded && (
                  <tr className="bg-bg-page/40">
                    <td colSpan={columns.length + 1} className="p-4 border-b border-border">
                      {renderSubComponent(row)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
