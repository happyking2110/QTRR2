import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ZoneBadgeProps {
  kind: 'kri' | 'kci';
  zone: 'green' | 'yellow' | 'red' | null;
  className?: string;
}

export function ZoneBadge({ kind, zone, className }: ZoneBadgeProps) {
  if (zone === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-none-bg text-state-none-fg border border-state-none-line/30',
          className,
        )}
      >
        <Minus className="w-3.5 h-3.5 text-state-none-fg" aria-hidden="true" />
        <span>Chưa có số liệu</span>
      </span>
    );
  }

  if (kind === 'kri') {
    switch (zone) {
      case 'green':
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30',
              className,
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-state-ok-line" aria-hidden="true" />
            <span>Trong ngưỡng</span>
          </span>
        );
      case 'yellow':
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-warn-bg text-state-warn-fg border border-state-warn-line/30',
              className,
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-state-warn-line" aria-hidden="true" />
            <span>Cảnh báo</span>
          </span>
        );
      case 'red':
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30',
              className,
            )}
          >
            <AlertCircle className="w-3.5 h-3.5 text-state-bad-line" aria-hidden="true" />
            <span>Vượt ngưỡng</span>
          </span>
        );
    }
  }

  // kind === 'kci'
  switch (zone) {
    case 'green':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30',
            className,
          )}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-state-ok-line" aria-hidden="true" />
          <span>Hiệu quả</span>
        </span>
      );
    case 'yellow':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-warn-bg text-state-warn-fg border border-state-warn-line/30',
            className,
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-state-warn-line" aria-hidden="true" />
          <span>Hiệu quả một phần</span>
        </span>
      );
    case 'red':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30',
            className,
          )}
        >
          <AlertCircle className="w-3.5 h-3.5 text-state-bad-line" aria-hidden="true" />
          <span>Chưa hiệu quả</span>
        </span>
      );
  }
}
