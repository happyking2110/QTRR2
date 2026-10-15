import React from 'react';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/format';

export interface ProgressBarProps {
  value: number | null | undefined;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, className, showLabel = true }: ProgressBarProps) {
  const isNull = value === null || value === undefined;
  const numValue = isNull ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className={cn('flex items-center gap-2.5 w-full', className)}>
      <div
        role="progressbar"
        aria-valuenow={isNull ? 0 : value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Tiến độ"
        className="flex-1 h-2 rounded-full bg-border overflow-hidden"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            isNull ? 'bg-transparent' : 'bg-brand-blue-bright',
          )}
          style={{ width: `${numValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium tabular-nums text-text-muted min-w-[3rem] text-right">
          {isNull ? '—' : formatPercent(value)}
        </span>
      )}
    </div>
  );
}
