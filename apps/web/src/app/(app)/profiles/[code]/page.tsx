import React from 'react';
import { notFound } from 'next/navigation';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import ProfileDetailView from './ProfileDetailView';
import { ErrorState } from '@/components/ui/ErrorState';

type ProfileDetail = components['schemas']['ProfileDetail'];
type IndicatorHistoryItem = components['schemas']['IndicatorHistoryItem'];
type CurrentUser = components['schemas']['CurrentUser'];
type Heatmap = components['schemas']['Heatmap'];
type UnitSummary = components['schemas']['UnitSummary'];

export const dynamic = 'force-dynamic';

export interface ProfilePageProps {
  params: {
    code: string;
  };
  searchParams?: {
    cycle?: string;
    period?: string;
  };
}

export default async function ProfileDetailPage({
  params,
  searchParams,
}: ProfilePageProps) {
  const riskCode = params.code;
  const cycle = searchParams?.cycle ? parseInt(searchParams.cycle, 10) : undefined;
  const period = searchParams?.period;

  const queryParams = {
    cycle: cycle ? String(cycle) : undefined,
    period: period || undefined,
  };

  try {
    const [currentUser, detail, heatmap, units] = await Promise.all([
      apiGet<CurrentUser>('/api/auth/me').catch(() => null),
      apiGet<ProfileDetail>(
        `/api/profiles/${encodeURIComponent(riskCode)}`,
        queryParams,
      ),
      apiGet<Heatmap>('/api/heatmap', queryParams).catch(() => null),
      apiGet<UnitSummary[]>('/api/units').catch(() => []),
    ]);

    // Lấy song song lịch sử cho các KRI để vẽ sparkline
    const kriList = (detail.indicators || []).filter((i) => i.kind === 'kri');
    const histories: Record<string, IndicatorHistoryItem[]> = {};

    await Promise.all(
      kriList.map(async (kri) => {
        try {
          const hist = await apiGet<IndicatorHistoryItem[]>(
            `/api/indicators/${encodeURIComponent(kri.id)}/history`,
            queryParams,
          );
          histories[kri.id] = hist;
        } catch (err) {
          if (isRedirectError(err)) throw err;
          histories[kri.id] = [];
        }
      }),
    );

    return (
      <ProfileDetailView
        currentUser={currentUser}
        heatmap={heatmap}
        units={units}
        detail={detail}
        indicatorHistories={histories}
      />
    );
  } catch (err: unknown) {
    if (isRedirectError(err)) {
      throw err;
    }
    if (err instanceof ApiClientError && err.statusCode === 404) {
      notFound();
    }

    const errorObj = err as { message?: string; requestId?: string };
    return (
      <ErrorState
        title={`Không thể tải hồ sơ rủi ro ${riskCode}`}
        message={errorObj.message || 'Đã xảy ra lỗi khi kết nối tới máy chủ.'}
        requestId={errorObj.requestId}
      />
    );
  }
}
