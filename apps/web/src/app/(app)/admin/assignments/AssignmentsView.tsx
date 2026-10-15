'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserCheck, AlertTriangle, Layers } from 'lucide-react';
import { apiSend, ApiClientError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { ControlAssignmentsTable } from './ControlAssignmentsTable';
import { IndicatorAssignmentsTable } from './IndicatorAssignmentsTable';
import { TaskAssignmentsTable } from './TaskAssignmentsTable';
import { EmptyState } from '@/components/ui/EmptyState';

type Assignments = components['schemas']['Assignments'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type UnitSummary = components['schemas']['UnitSummary'];
type CycleSummary = components['schemas']['CycleSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export interface AssignmentsViewProps {
  profiles: ProfileSummary[];
  units: UnitSummary[];
  cycles: CycleSummary[];
  initialAssignments: Assignments | null;
  currentUser?: CurrentUser | null;
  selectedCycleYear?: number | null;
  selectedProfileCode?: string | null;
}

export function AssignmentsView({
  profiles,
  units,
  cycles,
  initialAssignments,
  currentUser,
  selectedCycleYear,
  selectedProfileCode,
}: AssignmentsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cycleParam = searchParams.get('cycle');
  const profileParam = searchParams.get('profile');

  const activeCycleYear = Number(
    selectedCycleYear !== undefined && selectedCycleYear !== null
      ? selectedCycleYear
      : cycleParam ||
        cycles.find((c) => c.status === 'open')?.year ||
        cycles[0]?.year ||
        2026,
  );

  const activeCycle = cycles.find((c) => c.year === activeCycleYear);
  const isArchived = activeCycle?.status === 'archived';

  const defaultProfile =
    profiles.find((p) => p.riskCode === profileParam) ??
    profiles.find((p) => p.riskCode === selectedProfileCode) ??
    profiles[0];

  const [currentRiskCode, setCurrentRiskCode] = useState<string>(
    defaultProfile ? defaultProfile.riskCode : '',
  );
  const [assignments, setAssignments] = useState<Assignments | null>(initialAssignments);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';
  const isBan4 = currentUser?.role === 'ban4';

  const handleProfileChange = async (newRiskCode: string) => {
    setCurrentRiskCode(newRiskCode);
    setLoadError(null);

    const params = new URLSearchParams(searchParams.toString());
    params.set('profile', newRiskCode);
    params.set('cycle', String(activeCycleYear));
    router.replace(`/admin/assignments?${params.toString()}`);

    setIsLoading(true);
    try {
      const data = await apiSend<Assignments>(
        `/api/profiles/${encodeURIComponent(newRiskCode)}/assignments?cycle=${activeCycleYear}`,
      );
      setAssignments(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setLoadError(err.message);
      } else {
        setLoadError((err as Error).message || 'Không thể tải dữ liệu phân công.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-navy">
            <UserCheck className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>Quản trị hệ thống</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-text mt-1">
            Gán đơn vị phụ trách
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Phân công đơn vị thực hiện biện pháp kiểm soát, chỉ số rủi ro KRI/KCI và đầu việc kế hoạch hành động.
          </p>
        </div>

        {/* Profile Selector */}
        {profiles.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="assignment-profile-select"
              className="text-xs font-semibold text-text whitespace-nowrap"
            >
              Chọn hồ sơ rủi ro:
            </label>
            <select
              id="assignment-profile-select"
              value={currentRiskCode}
              onChange={(e) => handleProfileChange(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-control border border-border bg-surface text-text max-w-xs focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              {profiles.map((p) => (
                <option key={p.riskCode} value={p.riskCode}>
                  {p.riskCode} - {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Archived Cycle Warning Banner */}
      {isArchived && (
        <div
          role="alert"
          className="p-3.5 rounded-card bg-state-warn-bg/40 border border-state-warn-line/50 text-xs text-text flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-state-warn-line shrink-0" aria-hidden="true" />
          <span>
            <strong>Chu kỳ {activeCycleYear} đã được lưu trữ (chỉ đọc).</strong> Tất cả các thao tác gán hoặc thay đổi đơn vị đều bị khóa để bảo toàn dữ liệu lịch sử.
          </span>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div
          role="alert"
          className="p-3.5 rounded-card bg-state-bad-bg/30 border border-state-bad-line/40 text-xs text-state-bad-line"
        >
          {loadError}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-12 text-center text-xs text-text-muted">
          Đang tải thông tin phân công của hồ sơ {currentRiskCode}...
        </div>
      )}

      {/* Content: 3 Tables */}
      {!isLoading && assignments && (
        <div className="space-y-10">
          {/* Table 1: Controls */}
          <ControlAssignmentsTable
            controls={assignments.controls}
            units={units}
            riskCode={assignments.riskCode}
            cycleYear={activeCycleYear}
            canEdit={isAdmin}
            isArchived={isArchived}
          />

          {/* Table 2: Indicators */}
          <IndicatorAssignmentsTable
            indicators={assignments.indicators}
            units={units}
            riskCode={assignments.riskCode}
            cycleYear={activeCycleYear}
            canEdit={isAdmin}
            isArchived={isArchived}
          />

          {/* Table 3: Action Tasks */}
          <TaskAssignmentsTable
            tasks={assignments.tasks}
            units={units}
            canEdit={isAdmin || isBan4}
            isArchived={isArchived}
          />
        </div>
      )}

      {!isLoading && !assignments && !loadError && (
        <EmptyState
          icon={<Layers className="w-10 h-10 text-brand-blue" aria-hidden="true" />}
          title="Không có dữ liệu phân công"
          description="Vui lòng chọn một hồ sơ rủi ro để xem và gán đơn vị."
        />
      )}
    </div>
  );
}
