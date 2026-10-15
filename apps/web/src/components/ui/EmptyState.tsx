import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-card border border-dashed border-border bg-surface/50 min-h-[160px]',
        className,
      )}
    >
      <div className="text-text-muted mb-3">
        {icon || <Inbox className="w-8 h-8 opacity-60" aria-hidden="true" />}
      </div>
      <h3 className="text-base font-semibold text-text mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted max-w-md mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
