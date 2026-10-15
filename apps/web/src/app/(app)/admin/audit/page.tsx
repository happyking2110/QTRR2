import React from 'react';
import type { Metadata } from 'next';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { AuditView } from './AuditView';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';

type CurrentUser = components['schemas']['CurrentUser'];
type AuditPage = components['schemas']['AuditPage'];

export const metadata: Metadata = {
  title: 'Nhật ký hoạt động | MBF Risk Monitor',
  description: 'Truy vết và xem chi tiết thay đổi nhật ký hoạt động hệ thống',
};

export const dynamic = 'force-dynamic';

export interface AuditPageProps {
  searchParams?: {
    actor?: string;
    entity?: string;
    action?: string;
    from?: string;
    to?: string;
  };
}

export default async function Page({ searchParams }: AuditPageProps) {
  try {
    const currentUser = await apiGet<CurrentUser>('/api/auth/me');
    if (currentUser.role !== 'admin' && currentUser.role !== 'ban4') {
      return <ForbiddenState />;
    }

    const params = new URLSearchParams();
    if (searchParams?.actor) params.set('actor', searchParams.actor);
    if (searchParams?.entity) params.set('entity', searchParams.entity);
    if (searchParams?.action) params.set('action', searchParams.action);
    if (searchParams?.from) params.set('from', searchParams.from);
    if (searchParams?.to) params.set('to', searchParams.to);

    const queryString = params.toString();
    const endpoint = `/api/audit${queryString ? `?${queryString}` : ''}`;
    const initialData = await apiGet<AuditPage>(endpoint);

    return (
      <AuditView
        initialData={initialData}
        initialFilters={{
          actor: searchParams?.actor ?? '',
          entity: searchParams?.entity ?? '',
          action: searchParams?.action ?? '',
          from: searchParams?.from ?? '',
          to: searchParams?.to ?? '',
        }}
        currentUser={currentUser}
      />
    );
  } catch (err: unknown) {
    if (isRedirectError(err)) {
      throw err;
    }
    if (err instanceof ApiClientError && err.statusCode === 403) {
      return <ForbiddenState />;
    }
    const message = err instanceof Error ? err.message : 'Không thể tải nhật ký hoạt động';
    return <ErrorState message={message} />;
  }
}
