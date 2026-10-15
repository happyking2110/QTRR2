import React from 'react';
import type { Metadata } from 'next';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { SettingsView } from './SettingsView';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';

type Settings = components['schemas']['Settings'];
type CurrentUser = components['schemas']['CurrentUser'];

export const metadata: Metadata = {
  title: 'Cấu hình hệ thống | MBF Risk Monitor',
  description: 'Thiết lập các ngưỡng cảnh báo và thời hạn số liệu của hệ thống',
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  let isForbidden = false;
  let fetchError: string | null = null;

  try {
    const currentUser = await apiGet<CurrentUser>('/api/auth/me');
    if (currentUser.role !== 'admin') {
      return <ForbiddenState />;
    }

    const settings = await apiGet<Settings>('/api/settings');

    return <SettingsView initialSettings={settings} />;
  } catch (err: unknown) {
    if (isRedirectError(err)) {
      throw err;
    }
    if (
      (err instanceof ApiClientError && (err.statusCode === 403 || err.code === 'FORBIDDEN')) ||
      (err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 403)
    ) {
      isForbidden = true;
    } else {
      fetchError = (err as Error)?.message || 'Không thể tải cấu hình hệ thống.';
    }
  }

  if (isForbidden) {
    return <ForbiddenState />;
  }

  return (
    <div className="py-8">
      <ErrorState
        title="Không thể tải cấu hình"
        message={fetchError || 'Đã xảy ra lỗi không xác định.'}
      />
    </div>
  );
}
