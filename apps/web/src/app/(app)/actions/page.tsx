import React from 'react';
import { apiGet, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import ActionsView from './ActionsView';
import { ErrorState } from '@/components/ui/ErrorState';

type ActionListItem = components['schemas']['ActionListItem'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type UnitSummary = components['schemas']['UnitSummary'];
type Overview = components['schemas']['Overview'];
type CurrentUser = components['schemas']['CurrentUser'];

export const dynamic = 'force-dynamic';

export interface ActionsPageProps {
  searchParams?: {
    cycle?: string;
    period?: string;
    riskCode?: string;
    status?: string;
    unit?: string;
    dueFrom?: string;
    dueTo?: string;
    q?: string;
  };
}

export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const cycle = searchParams?.cycle ? parseInt(searchParams.cycle, 10) : undefined;
  const period = searchParams?.period;

  const queryParams = {
    cycle: cycle ? String(cycle) : undefined,
    period: period || undefined,
    riskCode: searchParams?.riskCode || undefined,
    status: searchParams?.status || undefined,
    unit: searchParams?.unit || undefined,
    dueFrom: searchParams?.dueFrom || undefined,
    dueTo: searchParams?.dueTo || undefined,
    q: searchParams?.q || undefined,
  };

  try {
    const [actions, profiles, units, overview, currentUser] = await Promise.all([
      apiGet<ActionListItem[]>('/api/actions', queryParams),
      apiGet<ProfileSummary[]>('/api/profiles', {
        cycle: cycle ? String(cycle) : undefined,
      }),
      apiGet<UnitSummary[]>('/api/units'),
      apiGet<Overview>('/api/overview', {
        cycle: cycle ? String(cycle) : undefined,
        period: period || undefined,
      }).catch((err) => {
        if (isRedirectError(err)) throw err;
        return null;
      }),
      apiGet<CurrentUser>('/api/auth/me'),
    ]);

    return (
      <ActionsView
        actions={actions}
        profiles={profiles}
        units={units}
        overview={overview}
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
        title="Không thể tải danh sách kế hoạch hành động"
        message={errorObj.message || 'Đã xảy ra lỗi khi kết nối tới máy chủ.'}
        requestId={errorObj.requestId}
      />
    );
  }
}
