import React from 'react';
import { Clock, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { components } from '@/lib/api/schema';

export type SubmissionStatus = components['schemas']['SubmissionStatus'];

export interface ApprovalBadgeProps {
  status: SubmissionStatus | 'pending' | 'approved' | 'rejected' | 'withdrawn';
  className?: string;
}

export function ApprovalBadge({ status, className }: ApprovalBadgeProps) {
  switch (status) {
    case 'pending':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-wait-bg text-state-wait-fg border border-state-wait-line/30',
            className,
          )}
        >
          <Clock className="w-3.5 h-3.5 text-state-wait-line" aria-hidden="true" />
          <span>Chờ duyệt</span>
        </span>
      );
    case 'approved':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30',
            className,
          )}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-state-ok-line" aria-hidden="true" />
          <span>Đã duyệt</span>
        </span>
      );
    case 'rejected':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30',
            className,
          )}
        >
          <XCircle className="w-3.5 h-3.5 text-state-bad-line" aria-hidden="true" />
          <span>Bị từ chối</span>
        </span>
      );
    case 'withdrawn':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-none-bg text-state-none-fg border border-state-none-line/30',
            className,
          )}
        >
          <RotateCcw className="w-3.5 h-3.5 text-state-none-fg" aria-hidden="true" />
          <span>Đã rút</span>
        </span>
      );
    default:
      return null;
  }
}
