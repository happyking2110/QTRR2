'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface PrintHeaderProps {
  title?: string;
  cycle?: string | number | null;
  period?: string | null;
  printedBy?: string | null;
  className?: string;
  forceVisible?: boolean;
}

export function PrintHeader({
  title,
  cycle,
  period,
  printedBy,
  className,
  forceVisible = false,
}: PrintHeaderProps) {
  const [printDate, setPrintDate] = useState<string>('');

  useEffect(() => {
    const now = new Date();
    const formatted = now.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    setPrintDate(formatted);
  }, []);

  return (
    <div
      data-testid="print-header"
      className={cn(
        forceVisible ? 'block' : 'hidden print:block',
        'pb-3 mb-6 border-b-2 border-slate-900 text-xs text-slate-800',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wider">
            MBF Risk Monitor
          </span>
          <span className="text-slate-400">|</span>
          <span className="font-semibold text-slate-700">
            Hồ sơ rủi ro trọng yếu
          </span>
        </div>
        <div className="text-right text-[11px] text-slate-600 font-mono">
          Thời điểm in: {printDate || '—'}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between mt-2 pt-2 border-t border-slate-300 text-[11px]">
        <div className="flex items-center gap-4">
          {cycle && (
            <span>
              <strong>Chu kỳ:</strong> {cycle}
            </span>
          )}
          {period && (
            <span>
              <strong>Kỳ báo cáo:</strong> {period}
            </span>
          )}
          {title && (
            <span>
              <strong>Nội dung:</strong> {title}
            </span>
          )}
        </div>
        <div>
          <span>
            <strong>Người in:</strong> {printedBy || 'Thành viên MBF'}
          </span>
        </div>
      </div>
    </div>
  );
}
