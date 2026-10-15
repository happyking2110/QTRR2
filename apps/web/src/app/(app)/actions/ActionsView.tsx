'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { components } from '@/lib/api/schema';
import { PageHero } from '@/components/ui/PageHero';
import { FilterBar } from '@/components/data/FilterBar';
import { DataTable, type Column } from '@/components/data/DataTable';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { ProgressBar } from '@/components/domain/ProgressBar';
import { ApprovalBadge } from '@/components/domain/ApprovalBadge';
import { TaskUpdateForm, type TaskUpdateFormTask } from '@/components/domain/TaskUpdateForm';
import { TaskUpdatesHistoryDrawer } from '@/components/domain/TaskUpdatesHistoryDrawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiSend, ApiClientError } from '@/lib/api/client';
import { formatDate, formatPercent } from '@/lib/format';
import { Search, ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

type ActionListItem = components['schemas']['ActionListItem'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type UnitSummary = components['schemas']['UnitSummary'];
type Overview = components['schemas']['Overview'];
type CurrentUser = components['schemas']['CurrentUser'];

export interface ActionsViewProps {
  actions: ActionListItem[];
  profiles: ProfileSummary[];
  units: UnitSummary[];
  overview?: Overview | null;
  filters: {
    riskCode?: string;
    status?: string;
    unit?: string;
    dueFrom?: string;
    dueTo?: string;
    q?: string;
  };
  currentUser?: CurrentUser | null;
}

const STATUS_CARDS = [
  { key: 'overdue', label: 'Quá hạn', color: 'bg-state-bad-line', textColor: 'text-state-bad-fg' },
  { key: 'at_risk', label: 'Có nguy cơ chậm', color: 'bg-state-warn-line', textColor: 'text-state-warn-fg' },
  { key: 'in_progress', label: 'Đang thực hiện', color: 'bg-brand-blue-bright', textColor: 'text-brand-blue-bright' },
  { key: 'not_started', label: 'Chưa bắt đầu', color: 'bg-state-none-line', textColor: 'text-text-muted' },
  { key: 'completed', label: 'Hoàn thành', color: 'bg-state-ok-line', textColor: 'text-state-ok-fg' },
] as const;

export default function ActionsView({
  actions,
  profiles,
  units,
  overview,
  filters,
  currentUser,
}: ActionsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Selected action for drawer
  const [selectedAction, setSelectedAction] = useState<ActionListItem | null>(null);

  // States for TaskUpdateForm and TaskUpdatesHistoryDrawer
  const [updateFormTask, setUpdateFormTask] = useState<TaskUpdateFormTask | null>(null);
  const [historyTask, setHistoryTask] = useState<{
    id: string;
    name: string;
    actionCode?: string;
    pendingSubmissions?: Array<{
      id: string;
      periodKey: string;
      canWithdraw: boolean;
    }>;
  } | null>(null);
  const [withdrawPendingId, setWithdrawPendingId] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const updateFilters = (newFilters: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(newFilters)) {
      if (val && val.trim() !== '') {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('riskCode');
    params.delete('status');
    params.delete('unit');
    params.delete('dueFrom');
    params.delete('dueTo');
    params.delete('q');
    router.push(`${pathname}?${params.toString()}`);
  };

  // Số lượng đếm theo trạng thái: ưu tiên từ overview, nếu không tính từ danh sách actions
  const statusCounts: Record<string, number> = overview
    ? {
        overdue: overview.actions.overdue,
        at_risk: overview.actions.atRisk,
        in_progress: overview.actions.inProgress,
        not_started: overview.actions.notStarted,
        completed: overview.actions.completed,
      }
    : {
        overdue: actions.filter((a) => a.action.status === 'overdue').length,
        at_risk: actions.filter((a) => a.action.status === 'at_risk').length,
        in_progress: actions.filter((a) => a.action.status === 'in_progress').length,
        not_started: actions.filter((a) => a.action.status === 'not_started').length,
        completed: actions.filter((a) => a.action.status === 'completed').length,
      };

  const columns: Column<ActionListItem>[] = [
    {
      id: 'code',
      header: 'Mã',
      cell: (row) => (
        <span className="font-mono font-bold text-brand-navy">
          {row.action.code}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'description',
      header: 'Hành động',
      cell: (row) => (
        <div className="space-y-1 max-w-md">
          <div className="font-semibold text-text line-clamp-2" title={row.action.description}>
            {row.action.description}
          </div>
          {row.action.responsibilityText && (
            <div className="text-[11px] text-text-muted line-clamp-1">
              {row.action.responsibilityText}
            </div>
          )}
          {row.action.controlCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {row.action.controlCodes.map((cc) => (
                <span
                  key={cc}
                  className="font-mono text-[10px] bg-bg-tint text-brand-blue border border-border/80 px-1 rounded"
                >
                  {cc}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'profile',
      header: 'Hồ sơ',
      cell: (row) => (
        <Link
          href={`/profiles/${row.riskCode}`}
          onClick={(e) => e.stopPropagation()}
          className="text-brand-blue hover:text-brand-navy font-medium line-clamp-1 max-w-[150px]"
          title={`${row.riskCode} - ${row.riskName}`}
        >
          {row.riskCode}
        </Link>
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'unit',
      header: 'Đầu mối',
      cell: (row) => {
        const unitName =
          row.action.tasks.map((t) => t.unit?.name).filter(Boolean).join(', ') ||
          'Chưa gán';
        return (
          <span className="text-text-muted max-w-[140px] truncate block" title={unitName}>
            {unitName}
          </span>
        );
      },
    },
    {
      id: 'dueDate',
      header: 'Hạn hoàn thành',
      cell: (row) => (
        <span className="tabular-nums font-semibold text-text">
          {formatDate(row.action.dueDate)}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'progress',
      header: 'Tiến độ',
      cell: (row) => (
        <div className="min-w-[120px] space-y-1">
          <div className="flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-text-muted font-medium">{formatPercent(row.action.progress)}</span>
          </div>
          <ProgressBar value={row.action.progress} showLabel={false} />
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Trạng thái',
      cell: (row) => <StatusBadge status={row.action.status} />,
      className: 'whitespace-nowrap',
    },
    {
      id: 'actions',
      header: '',
      cell: (row) => (
        <button
          type="button"
          onClick={() => setSelectedAction(row)}
          className="p-1 rounded text-text-muted hover:text-brand-blue hover:bg-bg-tint transition-colors focus:outline-none focus:ring-1 focus:ring-brand-bright"
          aria-label="Xem chi tiết kế hoạch"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      ),
      className: 'text-right',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Đầu trang theo site mẫu */}
      <PageHero
        eyebrow="THEO DÕI THỰC HIỆN"
        title="Kế hoạch hành động giảm thiểu rủi ro"
        description={`Toàn bộ kế hoạch hành động của ${String(profiles.length).padStart(2, '0')} hồ sơ rủi ro trọng yếu.`}
      />

      {/* 2. Năm thẻ đếm theo trạng thái (bấm lọc) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {STATUS_CARDS.map(({ key, label, color }) => {
          const count = statusCounts[key] ?? 0;
          const isSelected = filters.status === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                updateFilters({
                  status: isSelected ? undefined : key,
                })
              }
              className={cn(
                'rounded-card border bg-surface p-4 text-left transition shadow-xs hover:border-brand-blue/40',
                isSelected
                  ? 'border-brand-navy ring-2 ring-brand-navy/20 bg-bg-tint/30'
                  : 'border-border',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full shrink-0', color)} />
                <span className="text-xs font-medium text-text-muted">{label}</span>
              </div>
              <div className="mt-2 text-2xl font-bold text-text tabular-nums">{count}</div>
            </button>
          );
        })}
      </div>

      {/* 3. Hàng chip lọc hồ sơ và ô tìm kiếm */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Chip lọc hồ sơ */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => updateFilters({ riskCode: undefined })}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition',
              !filters.riskCode
                ? 'bg-brand-navy text-white shadow-xs'
                : 'bg-surface border border-border text-text-muted hover:text-text hover:bg-bg-tint',
            )}
          >
            Tất cả hồ sơ
          </button>
          {profiles.map((p) => {
            const isSelected = filters.riskCode === p.riskCode;
            return (
              <button
                key={p.riskCode}
                type="button"
                onClick={() =>
                  updateFilters({
                    riskCode: isSelected ? undefined : p.riskCode,
                  })
                }
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition',
                  isSelected
                    ? 'bg-brand-navy text-white shadow-xs'
                    : 'bg-surface border border-border text-text-muted hover:text-text hover:bg-bg-tint',
                )}
              >
                {p.riskCode} · {p.name.length > 20 ? `${p.name.slice(0, 18)}...` : p.name}
              </button>
            );
          })}
        </div>

        {/* Ô tìm kiếm */}
        <div className="relative min-w-[240px] shrink-0">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            placeholder="Tìm hành động, đầu mối, KRI/KCI..."
            value={filters.q ?? ''}
            onChange={(e) => updateFilters({ q: e.target.value })}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-control border border-border bg-surface text-text hover:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-bright"
          />
        </div>
      </div>

      {/* 4. Bộ lọc nâng cao (Đơn vị, Khoảng hạn) */}
      <FilterBar onReset={handleReset}>
        {/* Lọc đơn vị (ẩn khi units rỗng) */}
        {units.length > 0 && (
          <div>
            <label htmlFor="filter-unit" className="sr-only">
              Đơn vị
            </label>
            <select
              id="filter-unit"
              value={filters.unit ?? ''}
              onChange={(e) => updateFilters({ unit: e.target.value })}
              className="text-xs px-2.5 py-1.5 rounded-control border border-border bg-surface text-text hover:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-bright"
            >
              <option value="">Tất cả đơn vị</option>
              {units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Hạn từ ngày */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Hạn từ:</span>
          <input
            type="date"
            value={filters.dueFrom ?? ''}
            onChange={(e) => updateFilters({ dueFrom: e.target.value })}
            className="text-xs px-2 py-1 rounded-control border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand-bright"
          />
        </div>

        {/* Hạn đến ngày */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Đến:</span>
          <input
            type="date"
            value={filters.dueTo ?? ''}
            onChange={(e) => updateFilters({ dueTo: e.target.value })}
            className="text-xs px-2 py-1 rounded-control border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand-bright"
          />
        </div>
      </FilterBar>

      {/* 5. Bảng danh sách kế hoạch */}
      <div className="rounded-card border border-border bg-surface shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={actions}
          keyExtractor={(item) => item.action.code}
          onRowClick={(item) => setSelectedAction(item)}
          emptyMessage="Không có kế hoạch hành động"
        />
      </div>

      {/* 6. Ngăn chi tiết bên phải (RecordDrawer) */}
      <RecordDrawer
        open={Boolean(selectedAction)}
        onOpenChange={(open) => !open && setSelectedAction(null)}
        title={selectedAction ? selectedAction.action.code : 'Chi tiết kế hoạch'}
        description={selectedAction ? selectedAction.riskName : undefined}
      >
        {selectedAction && (
          <div className="space-y-6 text-xs">
            {/* Mô tả kế hoạch */}
            <div>
              <span className="font-semibold text-text-muted uppercase text-[10px] tracking-wider block mb-1">
                Mô tả kế hoạch hành động
              </span>
              <p className="text-text font-medium text-sm leading-relaxed">
                {selectedAction.action.description}
              </p>
            </div>

            {/* Trạng thái & Tiến độ */}
            <div className="grid grid-cols-2 gap-4 bg-bg-tint p-3 rounded-control border border-border">
              <div>
                <span className="text-text-muted block text-[11px] mb-1">Trạng thái</span>
                <StatusBadge status={selectedAction.action.status} />
              </div>
              <div>
                <span className="text-text-muted block text-[11px] mb-1">Tiến độ</span>
                <ProgressBar value={selectedAction.action.progress} />
              </div>
            </div>

            {/* Thông tin hồ sơ & Hạn */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-text-muted">Hồ sơ rủi ro:</span>
                <Link
                  href={`/profiles/${selectedAction.riskCode}`}
                  className="font-medium text-brand-blue hover:underline"
                >
                  {selectedAction.riskCode} - {selectedAction.riskName}
                </Link>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-text-muted">Hạn hoàn thành:</span>
                <span className="font-medium text-text tabular-nums">
                  {formatDate(selectedAction.action.dueDate)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-text-muted">Kiểm soát liên quan:</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {selectedAction.action.controlCodes.length > 0 ? (
                    selectedAction.action.controlCodes.map((code) => (
                      <span
                        key={code}
                        className="font-mono text-[10px] bg-bg-tint text-brand-blue px-1.5 py-0.5 rounded border border-border"
                      >
                        {code}
                      </span>
                    ))
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </div>
              </div>
            </div>

            {/* Danh sách đầu việc */}
            <div className="border-t border-border pt-4">
              <h4 className="font-bold text-brand-navy mb-2">
                Danh sách đầu việc ({selectedAction.action.tasks.length})
              </h4>
              {selectedAction.action.tasks.length === 0 ? (
                <p className="text-text-muted">Chưa có đầu việc phân rã</p>
              ) : (
                <div className="space-y-3">
                  {selectedAction.action.tasks.map((task) => {
                    const hasSubmit = Boolean(task.submitPeriodKeys && task.submitPeriodKeys.length > 0);
                    const withdrawable = task.pendingSubmissions?.find((p) => p.canWithdraw);
                    const isViewer = currentUser?.role === 'viewer';

                    return (
                      <div
                        key={task.id}
                        className="p-3 rounded-control border border-border bg-bg-tint/40 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text">{task.name}</span>
                            {task.pendingSubmissions && task.pendingSubmissions.length > 0 && (
                              <ApprovalBadge status="pending" />
                            )}
                          </div>
                          <span className="text-[10px] text-text-muted font-mono whitespace-nowrap">
                            Tỷ trọng: {task.weight}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-text-muted">
                          <span>Đơn vị: {task.unit ? task.unit.name : '—'}</span>
                          <span>Hạn: {formatDate(task.dueDate)}</span>
                        </div>
                        <div className="pt-1">
                          <ProgressBar value={task.progress} />
                        </div>
                        {task.sourceText && (
                          <div className="mt-2 pt-2 border-t border-border/60 text-[11px] text-text-muted italic whitespace-pre-line">
                            {task.sourceText}
                          </div>
                        )}
                        <div className="pt-2 border-t border-border/60 flex items-center justify-end gap-1.5">
                          {hasSubmit && (
                            <button
                              type="button"
                              onClick={() =>
                                setUpdateFormTask({
                                  ...task,
                                  actionCode: selectedAction.action.code,
                                })
                              }
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-xs"
                            >
                              Cập nhật tiến độ
                            </button>
                          )}
                          {withdrawable && (
                            <button
                              type="button"
                              onClick={() => setWithdrawPendingId(withdrawable.id)}
                              className="px-2 py-1 text-xs font-medium rounded border border-state-bad-line/40 text-state-bad-fg hover:bg-state-bad-bg transition"
                            >
                              Rút lại
                            </button>
                          )}
                          {!isViewer && (
                            <button
                              type="button"
                              onClick={() =>
                                setHistoryTask({
                                  ...task,
                                  actionCode: selectedAction.action.code,
                                })
                              }
                              className="px-2 py-1 text-xs font-medium rounded border border-border text-text hover:bg-bg-tint transition"
                            >
                              Lịch sử
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Văn bản gốc trong Excel */}
            {(selectedAction.action.responsibilityText ||
              selectedAction.action.deliverable ||
              selectedAction.action.dueText) && (
              <div className="border-t border-border pt-4 space-y-2">
                <h4 className="font-bold text-brand-navy flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                  <span>Văn bản gốc trong Excel</span>
                </h4>
                <div className="bg-bg-tint/60 p-3 rounded-control border border-border space-y-1.5 text-[11px]">
                  {selectedAction.action.responsibilityText && (
                    <div>
                      <span className="font-semibold text-text">Trách nhiệm:</span>{' '}
                      <span className="text-text-muted">
                        {selectedAction.action.responsibilityText}
                      </span>
                    </div>
                  )}
                  {selectedAction.action.deliverable && (
                    <div>
                      <span className="font-semibold text-text">Đầu ra yêu cầu:</span>{' '}
                      <span className="text-text-muted">
                        {selectedAction.action.deliverable}
                      </span>
                    </div>
                  )}
                  {selectedAction.action.dueText && (
                    <div>
                      <span className="font-semibold text-text">Ngày hoàn thành (chữ):</span>{' '}
                      <span className="text-text-muted">
                        {selectedAction.action.dueText}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </RecordDrawer>

      {/* TaskUpdateForm dialog */}
      {updateFormTask && (
        <TaskUpdateForm
          task={updateFormTask}
          open={!!updateFormTask}
          onOpenChange={(open) => !open && setUpdateFormTask(null)}
          onSuccess={() => {
            setUpdateFormTask(null);
            router.refresh();
          }}
        />
      )}

      {/* TaskUpdatesHistoryDrawer */}
      {historyTask && (
        <TaskUpdatesHistoryDrawer
          task={historyTask}
          open={!!historyTask}
          onOpenChange={(open) => !open && setHistoryTask(null)}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}

      {/* ConfirmDialog for quick withdraw */}
      <ConfirmDialog
        open={!!withdrawPendingId}
        onOpenChange={(open) => !open && setWithdrawPendingId(null)}
        title="Xác nhận rút lại bản nộp"
        description="Bạn có chắc chắn muốn rút lại bản cập nhật tiến độ đang chờ duyệt này không? Bản nộp sẽ chuyển sang trạng thái đã rút."
        confirmText="Rút lại"
        variant="danger"
        isSubmitting={isWithdrawing}
        onConfirm={async () => {
          if (!withdrawPendingId) return;
          setIsWithdrawing(true);
          try {
            await apiSend('POST', `/api/task-updates/${withdrawPendingId}/withdraw`);
            setWithdrawPendingId(null);
            router.refresh();
          } catch (err: unknown) {
            if (err instanceof ApiClientError) {
              alert(err.message);
            }
          } finally {
            setIsWithdrawing(false);
          }
        }}
      />
    </div>
  );
}
