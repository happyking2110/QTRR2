import React from 'react';
import type { Metadata } from 'next';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ReportsView } from './ReportsView';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';

type ProfileSummary = components['schemas']['ProfileSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export const metadata: Metadata = {
  title: 'Trung tâm báo cáo | MBF Risk Monitor',
  description: 'Xuất báo cáo tổng quan và biểu mẫu BM06 hồ sơ rủi ro',
};

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  let currentUser: CurrentUser | null = null;
  let profiles: ProfileSummary[] = [];
  let isForbidden = false;
  let fetchError: string | null = null;

  try {
    const [userRes, profilesRes] = await Promise.all([
      apiGet<CurrentUser>('/api/auth/me').catch(() => null),
      apiGet<ProfileSummary[]>('/api/profiles'),
    ]);
    currentUser = userRes;
    profiles = profilesRes;
  } catch (err) {
    if (isRedirectError(err)) {
      throw err;
    }
    if (
      (err instanceof ApiClientError && (err.statusCode === 403 || err.code === 'FORBIDDEN')) ||
      (err && typeof err === 'object' && ('statusCode' in err && (err as { statusCode: number }).statusCode === 403))
    ) {
      isForbidden = true;
    } else {
      fetchError = (err as Error)?.message || 'Không thể tải danh sách báo cáo.';
    }
  }

  if (isForbidden) {
    return <ForbiddenState />;
  }

  if (fetchError) {
    return (
      <div className="py-8">
        <ErrorState
          title="Không thể tải dữ liệu báo cáo"
          message={fetchError}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6">
      <ReportsView profiles={profiles} currentUser={currentUser} />
    </div>
  );
}
