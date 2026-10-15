import React from 'react';
import { apiGet, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import IndicatorsView from './IndicatorsView';
import { ErrorState } from '@/components/ui/ErrorState';

type IndicatorListItem = components['schemas']['IndicatorListItem'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type UnitSummary = components['schemas']['UnitSummary'];

type CurrentUser = components['schemas']['CurrentUser'];

export const dynamic = 'force-dynamic';

export interface IndicatorsPageProps {
  searchParams?: {
    cycle?: string;
    period?: string;
    riskCode?: string;
    kind?: string;
    zone?: string;
    unit?: string;
  };
}

export default async function IndicatorsPage({
  searchParams,
}: IndicatorsPageProps) {
  const cycle = searchParams?.cycle ? parseInt(searchParams.cycle, 10) : undefined;
  const period = searchParams?.period;

  const queryParams = {
    cycle: cycle ? String(cycle) : undefined,
    period: period || undefined,
    riskCode: searchParams?.riskCode || undefined,
    kind: searchParams?.kind || undefined,
    zone: searchParams?.zone || undefined,
    unit: searchParams?.unit || undefined,
  };

  try {
    const [indicators, profiles, units, currentUser] = await Promise.all([
      apiGet<IndicatorListItem[]>('/api/indicators', queryParams),
      apiGet<ProfileSummary[]>('/api/profiles', {
        cycle: cycle ? String(cycle) : undefined,
      }),
      apiGet<UnitSummary[]>('/api/units'),
      apiGet<CurrentUser>('/api/auth/me'),
    ]);

    return (
      <IndicatorsView
        indicators={indicators}
        profiles={profiles}
        units={units}
        filters={searchParams ?? {}}
        currentUser={currentUser}
      />
    );
  } catch (err: unknown) {
    if (isRedirectError(err)) {
      throw err;
    }
    const errorObj = err as { message?: string; requestId?: string };
    return (
      <ErrorState
        title="Không thể tải danh sách chỉ số"
        message={errorObj.message || 'Đã xảy ra lỗi khi kết nối tới máy chủ.'}
        requestId={errorObj.requestId}
      />
    );
  }
}
