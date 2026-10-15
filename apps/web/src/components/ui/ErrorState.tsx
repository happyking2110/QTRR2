import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title?: string;
  message: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Đã xảy ra lỗi',
  message,
  requestId,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-card border border-state-bad-line/30 bg-state-bad-bg/20 min-h-[160px]',
        className,
      )}
    >
      <div className="w-10 h-10 rounded-full bg-state-bad-bg flex items-center justify-center text-state-bad-line mb-3">
        <AlertCircle className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-text mb-1">{title}</h3>
      <p className="text-sm text-text-muted max-w-md mb-2">{message}</p>
      {requestId && (
        <p className="text-xs text-text-muted font-mono mb-4">
          Mã yêu cầu: {requestId}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-control text-sm font-medium bg-brand-blue text-surface hover:bg-brand-navy transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright focus:ring-offset-2"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          <span>Thử lại</span>
        </button>
      )}
    </div>
  );
}
