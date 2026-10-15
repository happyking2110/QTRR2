import React from 'react';
import Link from 'next/link';
import { AlertCircle, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-border rounded-card p-8 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-state-warn-bg text-state-warn-fg flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-state-warn-line" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-brand-navy mb-2">404 - Không tìm thấy trang</h1>
        <p className="text-sm text-text-muted mb-6">
          Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển trong hệ thống.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-surface rounded-control text-sm font-medium hover:bg-brand-navy transition-colors focus:outline-none focus:ring-2 focus:ring-brand-bright"
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          <span>Về trang chủ</span>
        </Link>
      </div>
    </div>
  );
}
