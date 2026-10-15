import React from 'react';
import type { Metadata } from 'next';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { CyclesView } from './CyclesView';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';

type CycleSummary = components['schemas']['CycleSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export const metadata: Metadata = {
  title: 'Quản trị chu kỳ | MBF Risk Monitor',
  description: 'Quản trị danh sách chu kỳ quản lý rủi ro trọng yếu MBF',
};

export const dynamic = 'force-dynamic';

export default async function CyclesPage() {
  let cycles: CycleSummary[] = [];
  let isForbidden = false;
  let fetchError: string | null = null;

  try {
    const currentUser = await apiGet<CurrentUser>('/api/auth/me');
    if (currentUser.role !== 'admin') {
      return <ForbiddenState />;
    }

    cycles = await apiGet<CycleSummary[]>('/api/cycles');
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
      fetchError = (err as Error)?.message || 'Không thể tải danh sách chu kỳ.';
    }
  }

  if (isForbidden) {
    return <ForbiddenState />;
  }

  if (fetchError) {
    return (
      <div className="py-8">
        <ErrorState
          title="Không thể tải danh sách chu kỳ"
          message={fetchError}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6">
      <CyclesView cycles={cycles} />
    </div>
  );
}
