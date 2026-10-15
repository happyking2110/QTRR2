import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BannerProps {
  type?: 'info' | 'warning' | 'error' | 'success';
  message: React.ReactNode;
  className?: string;
}

export function Banner({ type = 'info', message, className }: BannerProps) {
  const getStyles = () => {
    switch (type) {
      case 'warning':
        return {
          wrapper: 'bg-state-warn-bg text-state-warn-fg border-state-warn-line/30',
          icon: <AlertTriangle className="w-4 h-4 text-state-warn-line flex-shrink-0 mt-0.5" aria-hidden="true" />,
        };
      case 'error':
        return {
          wrapper: 'bg-state-bad-bg text-state-bad-fg border-state-bad-line/30',
          icon: <AlertCircle className="w-4 h-4 text-state-bad-line flex-shrink-0 mt-0.5" aria-hidden="true" />,
        };
      case 'success':
        return {
          wrapper: 'bg-state-ok-bg text-state-ok-fg border-state-ok-line/30',
          icon: <CheckCircle2 className="w-4 h-4 text-state-ok-line flex-shrink-0 mt-0.5" aria-hidden="true" />,
        };
      case 'info':
      default:
        return {
          wrapper: 'bg-state-info-bg text-state-info-fg border-state-info-line/30',
          icon: <Info className="w-4 h-4 text-state-info-line flex-shrink-0 mt-0.5" aria-hidden="true" />,
        };
    }
  };

  const { wrapper, icon } = getStyles();

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 p-3 rounded-control border text-sm',
        wrapper,
        className,
      )}
    >
      {icon}
      <div className="flex-1 font-medium">{message}</div>
    </div>
  );
}
