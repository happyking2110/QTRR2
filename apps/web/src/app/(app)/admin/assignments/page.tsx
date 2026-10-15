import React from 'react';
import type { Metadata } from 'next';
import { apiGet, ApiClientError, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { AssignmentsView } from './AssignmentsView';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { ErrorState } from '@/components/ui/ErrorState';

type Assignments = components['schemas']['Assignments'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type UnitSummary = components['schemas']['UnitSummary'];
type CycleSummary = components['schemas']['CycleSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gán đơn vị phụ trách | MBF Risk Monitor',
  description: 'Phân công đơn vị thực hiện kiểm soát, chỉ số và đầu việc',
};

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: { cycle?: string; profile?: string };
}) {
  let currentUser: CurrentUser | null = null;
  let cycles: CycleSummary[] = [];
  let units: UnitSummary[] = [];
  let profiles: ProfileSummary[] = [];
  let assignments: Assignments | null = null;

  let isForbidden = false;
  let fetchError: string | null = null;

  try {
    // 1. Fetch current user
    currentUser = await apiGet<CurrentUser>('/api/auth/me');

    // Check role: only admin and ban4 can access assignments
    if (currentUser.role !== 'admin' && currentUser.role !== 'ban4') {
      return (
        <ForbiddenState message="Chỉ Quản trị viên và Ban 4 mới có quyền truy cập trang phân công đơn vị." />
      );
    }

    // 2. Fetch cycles and units in parallel
    const [cyclesRes, unitsRes] = await Promise.all([
      apiGet<CycleSummary[]>('/api/cycles'),
      apiGet<UnitSummary[]>('/api/units'),
    ]);
    cycles = cyclesRes;
    units = unitsRes;

    // Determine target cycle year
    const activeCycleYear = Number(
      searchParams.cycle ||
        cycles.find((c) => c.status === 'open')?.year ||
        cycles[0]?.year ||
        2026,
    );

    // 3. Fetch profiles for that cycle
    if (cycles.length > 0) {
      profiles = await apiGet<ProfileSummary[]>('/api/profiles', {
        cycle: activeCycleYear,
      });
    }

    // Determine target profile
    const targetProfile =
      profiles.find((p) => p.riskCode === searchParams.profile) ?? profiles[0];

    // 4. Fetch assignments if profile exists
    if (targetProfile) {
      assignments = await apiGet<Assignments>(
        `/api/profiles/${encodeURIComponent(targetProfile.riskCode)}/assignments`,
        { cycle: activeCycleYear },
      );
    }
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
      fetchError = (err as Error)?.message || 'Không thể tải dữ liệu phân công đơn vị.';
    }
  }

  if (isForbidden) {
    return (
      <ForbiddenState message="Chỉ Quản trị viên và Ban 4 mới có quyền truy cập trang phân công đơn vị." />
    );
  }

  if (fetchError) {
    return (
      <div className="py-8">
        <ErrorState title="Không thể tải dữ liệu" message={fetchError} />
      </div>
    );
  }

  return (
    <AssignmentsView
      profiles={profiles}
      units={units}
      cycles={cycles}
      initialAssignments={assignments}
      currentUser={currentUser}
      selectedProfileCode={searchParams.profile}
      selectedCycleYear={
        searchParams.cycle
          ? Number(searchParams.cycle)
          : cycles.find((c) => c.status === 'open')?.year ?? cycles[0]?.year ?? 2026
      }
    />
  );
}
