'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';

export interface FilterBarProps {
  children: React.ReactNode;
  onReset?: () => void;
  className?: string;
}

export function FilterBar({ children, onReset, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 p-3 bg-surface rounded-card border border-border shadow-sm max-w-full min-w-0',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3 flex-1 max-w-full min-w-0">
        {children}
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-medium text-text-muted hover:text-text hover:bg-bg-tint border border-border transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Đặt lại</span>
        </button>
      )}
    </div>
  );
}
