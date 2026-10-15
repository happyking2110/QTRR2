import React from 'react';
import type { Metadata } from 'next';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { PeriodsView } from './PeriodsView';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';

type PeriodSummary = components['schemas']['PeriodSummary'];
type CycleSummary = components['schemas']['CycleSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export const metadata: Metadata = {
  title: 'Quản trị kỳ báo cáo | MBF Risk Monitor',
  description: 'Quản lý các kỳ báo cáo, khóa kỳ và mở lại kỳ số liệu',
};

export const dynamic = 'force-dynamic';

export interface PeriodsPageProps {
  searchParams?: {
    cycle?: string;
  };
}

export default async function PeriodsPage({ searchParams }: PeriodsPageProps) {
  let isForbidden = false;
  let fetchError: string | null = null;

  try {
    const currentUser = await apiGet<CurrentUser>('/api/auth/me');
    if (currentUser.role !== 'admin') {
      return <ForbiddenState />;
    }

    const cycles = await apiGet<CycleSummary[]>('/api/cycles');
    const selectedYear = searchParams?.cycle
      ? Number(searchParams.cycle)
      : cycles.find((c) => c.status === 'open')?.year ?? cycles[0]?.year ?? 2026;

    const periods = await apiGet<PeriodSummary[]>(`/api/cycles/${selectedYear}/periods`);

    return (
      <PeriodsView
        periods={periods}
        cycles={cycles}
        selectedYear={selectedYear}
      />
    );
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
      fetchError = (err as Error)?.message || 'Không thể tải danh sách kỳ báo cáo.';
    }
  }

  if (isForbidden) {
    return <ForbiddenState />;
  }

  return (
    <div className="py-8">
      <ErrorState
        title="Không thể tải kỳ báo cáo"
        message={fetchError || 'Đã xảy ra lỗi không xác định.'}
      />
    </div>
  );
}
