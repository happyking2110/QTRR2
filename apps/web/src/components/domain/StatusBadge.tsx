import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, ArrowRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActionStatus = 'completed' | 'overdue' | 'at_risk' | 'in_progress' | 'not_started';

export interface StatusBadgeProps {
  status: ActionStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  switch (status) {
    case 'completed':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30',
            className,
          )}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-state-ok-line" aria-hidden="true" />
          <span>Hoàn thành</span>
        </span>
      );
    case 'overdue':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30',
            className,
          )}
        >
          <AlertCircle className="w-3.5 h-3.5 text-state-bad-line" aria-hidden="true" />
          <span>Quá hạn</span>
        </span>
      );
    case 'at_risk':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-warn-bg text-state-warn-fg border border-state-warn-line/30',
            className,
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-state-warn-line" aria-hidden="true" />
          <span>Có nguy cơ chậm</span>
        </span>
      );
    case 'in_progress':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-info-bg text-state-info-fg border border-state-info-line/30',
            className,
          )}
        >
          <ArrowRight className="w-3.5 h-3.5 text-state-info-line" aria-hidden="true" />
          <span>Đang thực hiện</span>
        </span>
      );
    case 'not_started':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-none-bg text-state-none-fg border border-state-none-line/30',
            className,
          )}
        >
          <Minus className="w-3.5 h-3.5 text-state-none-fg" aria-hidden="true" />
          <span>Chưa bắt đầu</span>
        </span>
      );
  }
}
