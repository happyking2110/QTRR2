import React from 'react';
import { apiGet, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import OverviewView from './OverviewView';
import { ErrorState } from '@/components/ui/ErrorState';

type Overview = components['schemas']['Overview'];
type Heatmap = components['schemas']['Heatmap'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type IndicatorListItem = components['schemas']['IndicatorListItem'];
type ActionListItem = components['schemas']['ActionListItem'];

type CurrentUser = components['schemas']['CurrentUser'];

export const dynamic = 'force-dynamic';

export interface PageProps {
  searchParams?: {
    cycle?: string;
    period?: string;
  };
}

export default async function HomePage({ searchParams }: PageProps) {
  const cycle = searchParams?.cycle ? parseInt(searchParams.cycle, 10) : undefined;
  const period = searchParams?.period;

  const queryParams = {
    cycle: cycle ? String(cycle) : undefined,
    period: period || undefined,
  };

  try {
    const [
      currentUser,
      overview,
      heatmap,
      profiles,
      redKri,
      yellowKri,
      overdueActions,
      atRiskActions,
    ] = await Promise.all([
      apiGet<CurrentUser>('/api/auth/me').catch(() => null),
      apiGet<Overview>('/api/overview', queryParams),
      apiGet<Heatmap>('/api/heatmap', queryParams),
      apiGet<ProfileSummary[]>('/api/profiles', queryParams),
      apiGet<IndicatorListItem[]>('/api/indicators', {
        ...queryParams,
        kind: 'kri',
        zone: 'red',
      }),
      apiGet<IndicatorListItem[]>('/api/indicators', {
        ...queryParams,
        kind: 'kri',
        zone: 'yellow',
      }),
      apiGet<ActionListItem[]>('/api/actions', {
        ...queryParams,
        status: 'overdue',
      }),
      apiGet<ActionListItem[]>('/api/actions', {
        ...queryParams,
        status: 'at_risk',
      }),
    ]);

    // Nối KRI đỏ trước vàng, tối đa 10 dòng
    const alertKri = [...redKri, ...yellowKri].slice(0, 10);
    // Nối KH quá hạn và có nguy cơ chậm
    const urgentActions = [...overdueActions, ...atRiskActions];

    return (
      <OverviewView
        currentUser={currentUser}
        overview={overview}
        heatmap={heatmap}
        profiles={profiles}
        alertKri={alertKri}
        urgentActions={urgentActions}
      />
    );
  } catch (err: unknown) {
    if (isRedirectError(err)) {
      throw err;
    }
    const errorObj = err as { message?: string; requestId?: string };
    return (
      <ErrorState
        title="Không thể tải dữ liệu trang Tổng quan"
        message={errorObj.message || 'Đã xảy ra lỗi khi kết nối tới máy chủ.'}
        requestId={errorObj.requestId}
      />
    );
  }
}
