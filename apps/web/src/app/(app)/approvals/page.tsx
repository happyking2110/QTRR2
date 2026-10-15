import React from 'react';
import type { Metadata } from 'next';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import ApprovalsView from './ApprovalsView';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';

type ApprovalItem = components['schemas']['ApprovalItem'];
type CycleSummary = components['schemas']['CycleSummary'];
type PeriodSummary = components['schemas']['PeriodSummary'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export const metadata: Metadata = {
  title: 'Hàng chờ duyệt | MBF Risk Monitor',
  description: 'Phê duyệt số liệu chỉ số và tiến độ kế hoạch hành động',
};

export const dynamic = 'force-dynamic';

export interface ApprovalsPageProps {
  searchParams?: {
    period?: string;
    riskCode?: string;
    cycle?: string;
  };
}

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  let isForbidden = false;
  let fetchError: string | null = null;

  try {
    const currentUser = await apiGet<CurrentUser>('/api/auth/me');

    // Fetch cycle list
    const cycles = await apiGet<CycleSummary[]>('/api/cycles');
    const selectedYear = searchParams?.cycle
      ? Number(searchParams.cycle)
      : cycles.find((c) => c.status === 'open')?.year ?? cycles[0]?.year ?? 2026;

    const [periods, profiles, approvals] = await Promise.all([
      apiGet<PeriodSummary[]>(`/api/cycles/${selectedYear}/periods`).catch((err) => {
        if (isRedirectError(err)) throw err;
        return [] as PeriodSummary[];
      }),
      apiGet<ProfileSummary[]>('/api/profiles', { cycle: selectedYear }).catch((err) => {
        if (isRedirectError(err)) throw err;
        return [] as ProfileSummary[];
      }),
      apiGet<ApprovalItem[]>('/api/approvals', {
        cycle: selectedYear,
        period: searchParams?.period || undefined,
        riskCode: searchParams?.riskCode || undefined,
      }),
    ]);

    return (
      <ApprovalsView
        items={approvals}
        periods={periods}
        profiles={profiles}
        filters={searchParams ?? {}}
        currentUser={currentUser}
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
      fetchError = (err as Error)?.message || 'Không thể tải danh sách hàng chờ duyệt.';
    }
  }

  if (isForbidden) {
    return <ForbiddenState />;
  }

  return (
    <div className="py-8">
      <ErrorState
        title="Không thể tải hàng chờ duyệt"
        message={fetchError || 'Đã xảy ra lỗi không xác định.'}
      />
    </div>
  );
}
