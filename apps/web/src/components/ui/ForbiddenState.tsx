import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ForbiddenStateProps {
  title?: string;
  message?: string;
  className?: string;
}

export function ForbiddenState({
  title = 'Truy cập bị từ chối',
  message = 'Bạn không có quyền truy cập trang này. Vui lòng liên hệ quản trị viên hệ thống hoặc quay lại trang chủ.',
  className,
}: ForbiddenStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-card border border-state-bad-line/30 bg-surface min-h-[240px]',
        className,
      )}
    >
      <div className="w-12 h-12 rounded-full bg-state-bad-bg flex items-center justify-center text-state-bad-line mb-4">
        <ShieldAlert className="w-6 h-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-text mb-2">{title}</h2>
      <p className="text-sm text-text-muted max-w-md mb-6">{message}</p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-control text-sm font-medium bg-brand-navy text-surface hover:bg-brand-navy-light transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright focus:ring-offset-2"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Quay lại trang chủ</span>
      </Link>
    </div>
  );
}
