'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { components } from '@/lib/api/schema';
import { FilterBar } from '@/components/data/FilterBar';
import { DataTable, type Column } from '@/components/data/DataTable';
import { RecordDrawer } from '@/components/data/RecordDrawer';
import { ZoneBadge } from '@/components/domain/ZoneBadge';
import { IndicatorHistoryChart } from '@/components/domain/IndicatorHistoryChart';
import { ApprovalBadge } from '@/components/domain/ApprovalBadge';
import { ReadingForm } from '@/components/domain/ReadingForm';
import { ReadingsHistoryDrawer } from '@/components/domain/ReadingsHistoryDrawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiSend, ApiClientError } from '@/lib/api/client';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChevronRight, Sparkles } from 'lucide-react';

import { PageHero } from '@/components/ui/PageHero';
import { Card } from '@/components/ui/Card';

type IndicatorListItem = components['schemas']['IndicatorListItem'];
type Indicator = components['schemas']['Indicator'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type UnitSummary = components['schemas']['UnitSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export interface IndicatorsViewProps {
  indicators: IndicatorListItem[];
  profiles: ProfileSummary[];
  units: UnitSummary[];
  filters: {
    riskCode?: string;
    kind?: string;
    zone?: string;
    unit?: string;
  };
  currentUser?: CurrentUser | null;
}

export default function IndicatorsView({
  indicators,
  profiles,
  units,
  filters,
  currentUser,
}: IndicatorsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Selected indicator for drawer
  const [selectedItem, setSelectedItem] = useState<IndicatorListItem | null>(null);

  // Modal and drawer states for reading submissions
  const [readingFormIndicator, setReadingFormIndicator] = useState<Indicator | null>(null);
  const [historyIndicator, setHistoryIndicator] = useState<Indicator | null>(null);
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
    params.delete('kind');
    params.delete('zone');
    params.delete('unit');
    router.push(`${pathname}?${params.toString()}`);
  };

  // Metrics
  const totalCount = indicators.length;
  const kriCount = indicators.filter((i) => i.indicator.kind === 'kri').length;
  const kciCount = indicators.filter((i) => i.indicator.kind === 'kci').length;
  const greenCount = indicators.filter((i) => i.indicator.current?.zone === 'green').length;
  const attentionCount = indicators.filter(
    (i) => i.indicator.current?.zone === 'yellow' || i.indicator.current?.zone === 'red',
  ).length;

  const columns: Column<IndicatorListItem>[] = [
    {
      id: 'code',
      header: 'Mã chỉ số',
      cell: (row) => (
        <span className="font-mono font-bold text-brand-navy">
          {row.indicator.code}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'name',
      header: 'Tên chỉ số',
      cell: (row) => (
        <span className="font-medium text-text line-clamp-2 max-w-sm" title={row.indicator.name}>
          {row.indicator.name}
        </span>
      ),
    },
    {
      id: 'profile',
      header: 'Hồ sơ',
      cell: (row) => (
        <Link
          href={`/profiles/${row.riskCode}`}
          onClick={(e) => e.stopPropagation()}
          className="text-brand-blue hover:underline font-medium font-mono text-xs"
        >
          {row.riskCode}
        </Link>
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'kind',
      header: 'Loại',
      cell: (row) => (
        <span className="uppercase text-[11px] font-bold px-1.5 py-0.5 rounded bg-bg-tint text-brand-blue border border-border">
          {row.indicator.kind}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'frequency',
      header: 'Tần suất',
      cell: (row) => <span className="text-text-muted">{row.indicator.frequency}</span>,
      className: 'whitespace-nowrap',
    },
    {
      id: 'currentValue',
      header: 'Giá trị hiện hành',
      cell: (row) => (
        <span className="font-medium tabular-nums text-text">
          {row.indicator.current ? row.indicator.current.valueText : '—'}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'zone',
      header: 'Vùng đánh giá',
      cell: (row) => (
        <ZoneBadge
          kind={row.indicator.kind}
          zone={row.indicator.current ? row.indicator.current.zone : null}
        />
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'period',
      header: 'Kỳ',
      cell: (row) => (
        <span className="text-text-muted font-medium font-mono text-xs">
          {row.indicator.current ? row.indicator.current.periodKey : '—'}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      id: 'submissionStatus',
      header: 'Trạng thái bản nộp',
      cell: (row) => {
        if (row.indicator.pendingSubmissions && row.indicator.pendingSubmissions.length > 0) {
          return <ApprovalBadge status="pending" />;
        }
        return <span className="text-text-muted">—</span>;
      },
      className: 'whitespace-nowrap',
    },
    {
      id: 'actions',
      header: 'Hành động',
      cell: (row) => {
        const hasSubmit = Boolean(
          row.indicator.submitPeriodKeys && row.indicator.submitPeriodKeys.length > 0,
        );
        const withdrawable = row.indicator.pendingSubmissions?.find((p) => p.canWithdraw);
        const isViewer = currentUser?.role === 'viewer';

        return (
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {hasSubmit && (
              <button
                type="button"
                onClick={() => setReadingFormIndicator(row.indicator)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-xs whitespace-nowrap"
              >
                Nhập số liệu
              </button>
            )}
            {withdrawable && (
              <button
                type="button"
                onClick={() => setWithdrawPendingId(withdrawable.id)}
                className="px-2 py-1 text-xs font-medium rounded border border-state-bad-line/40 text-state-bad-fg hover:bg-state-bad-bg transition whitespace-nowrap"
              >
                Rút lại
              </button>
            )}
            {!isViewer && (
              <button
                type="button"
                onClick={() => setHistoryIndicator(row.indicator)}
                className="px-2 py-1 text-xs font-medium rounded border border-border text-text hover:bg-bg-tint transition whitespace-nowrap"
              >
                Lịch sử
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedItem(row)}
              className="p-1 rounded text-text-muted hover:text-brand-blue hover:bg-bg-tint transition-colors focus:outline-none focus:ring-1 focus:ring-brand-bright"
              aria-label="Xem chi tiết chỉ số"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        );
      },
      className: 'text-right whitespace-nowrap',
    },
  ];

  return (
    <div className="space-y-6 max-w-full min-w-0">
      {/* 1. Page Hero Banner */}
      <PageHero
        eyebrow="THEO DÕI CHỈ SỐ"
        title="Chỉ số rủi ro & kiểm soát"
        description="Theo dõi giá trị đo lường và vùng cảnh báo của các chỉ số rủi ro trọng yếu (KRI) và kiểm soát trọng yếu (KCI)."
      />

      {/* 2. Thẻ thống kê nhanh */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-full min-w-0">
        <Card
          className="p-3.5 bg-surface cursor-pointer hover:border-brand-blue/50 transition-colors"
          onClick={() => {
            updateFilters({ kind: undefined, zone: undefined });
          }}
        >
          <div className="text-[11px] font-medium text-text-muted">Tất cả chỉ số</div>
          <div className="text-2xl font-bold font-mono text-brand-navy mt-1">{totalCount}</div>
        </Card>

        <Card
          className={`p-3.5 bg-surface cursor-pointer hover:border-brand-blue/50 transition-colors ${
            filters.kind === 'kri' ? 'ring-2 ring-brand-blue' : ''
          }`}
          onClick={() => {
            updateFilters({ kind: filters.kind === 'kri' ? undefined : 'kri' });
          }}
        >
          <div className="text-[11px] font-medium text-text-muted">Chỉ số KRI</div>
          <div className="text-2xl font-bold font-mono text-brand-blue mt-1">{kriCount}</div>
        </Card>

        <Card
          className={`p-3.5 bg-surface cursor-pointer hover:border-brand-blue/50 transition-colors ${
            filters.kind === 'kci' ? 'ring-2 ring-brand-blue' : ''
          }`}
          onClick={() => {
            updateFilters({ kind: filters.kind === 'kci' ? undefined : 'kci' });
          }}
        >
          <div className="text-[11px] font-medium text-text-muted">Chỉ số KCI</div>
          <div className="text-2xl font-bold font-mono text-brand-navy mt-1">{kciCount}</div>
        </Card>

        <Card
          className={`p-3.5 bg-surface cursor-pointer hover:border-state-ok-line transition-colors ${
            filters.zone === 'green' ? 'ring-2 ring-state-ok-line' : ''
          }`}
          onClick={() => {
            updateFilters({ zone: filters.zone === 'green' ? undefined : 'green' });
          }}
        >
          <div className="text-[11px] font-medium text-text-muted">Vùng an toàn (Xanh)</div>
          <div className="text-2xl font-bold font-mono text-state-ok-fg mt-1">{greenCount}</div>
        </Card>

        <Card
          className="p-3.5 bg-surface col-span-2 sm:col-span-1"
        >
          <div className="text-[11px] font-medium text-text-muted">Cảnh báo / Vượt</div>
          <div className="text-2xl font-bold font-mono text-state-bad-fg mt-1">{attentionCount}</div>
        </Card>
      </div>

      {/* 3. Quick Chips chọn hồ sơ */}
      {profiles.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin max-w-full min-w-0">
          <span className="text-xs font-semibold text-text-muted shrink-0 mr-1">Hồ sơ:</span>
          <button
            type="button"
            onClick={() => updateFilters({ riskCode: undefined })}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 ${
              !filters.riskCode
                ? 'bg-brand-navy text-white shadow-xs'
                : 'bg-surface text-text-muted hover:bg-bg-tint hover:text-text border border-border'
            }`}
          >
            Tất cả ({profiles.length})
          </button>
          {profiles.map((p) => {
            const isSelected = filters.riskCode === p.riskCode;
            return (
              <button
                key={p.riskCode}
                type="button"
                onClick={() => updateFilters({ riskCode: isSelected ? undefined : p.riskCode })}
                className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-brand-navy text-white shadow-xs'
                    : 'bg-surface text-text-muted hover:bg-bg-tint hover:text-text border border-border'
                }`}
                title={p.name}
              >
                {p.riskCode}
              </button>
            );
          })}
        </div>
      )}

      {/* 4. Thanh lọc chi tiết (FilterBar) */}
      <FilterBar onReset={handleReset}>
        {/* Lọc hồ sơ */}
        <div className="w-full sm:w-auto min-w-0">
          <label htmlFor="filter-ind-risk" className="sr-only">
            Hồ sơ rủi ro
          </label>
          <select
            id="filter-ind-risk"
            value={filters.riskCode ?? ''}
            onChange={(e) => updateFilters({ riskCode: e.target.value })}
            className="w-full sm:w-auto max-w-full sm:max-w-xs text-xs px-2.5 py-1.5 rounded-control border border-border bg-surface text-text hover:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-bright truncate"
          >
            <option value="">Tất cả hồ sơ</option>
            {profiles.map((p) => (
              <option key={p.riskCode} value={p.riskCode}>
                {p.riskCode} - {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Lọc loại (KRI / KCI) */}
        <div className="w-full sm:w-auto min-w-0">
          <label htmlFor="filter-ind-kind" className="sr-only">
            Loại chỉ số
          </label>
          <select
            id="filter-ind-kind"
            value={filters.kind ?? ''}
            onChange={(e) => updateFilters({ kind: e.target.value })}
            className="w-full sm:w-auto max-w-full text-xs px-2.5 py-1.5 rounded-control border border-border bg-surface text-text hover:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-bright"
          >
            <option value="">Tất cả loại (KRI & KCI)</option>
            <option value="kri">KRI (Chỉ số rủi ro)</option>
            <option value="kci">KCI (Chỉ số kiểm soát)</option>
          </select>
        </div>

        {/* Lọc vùng */}
        <div className="w-full sm:w-auto min-w-0">
          <label htmlFor="filter-ind-zone" className="sr-only">
            Vùng đánh giá
          </label>
          <select
            id="filter-ind-zone"
            value={filters.zone ?? ''}
            onChange={(e) => updateFilters({ zone: e.target.value })}
            className="w-full sm:w-auto max-w-full text-xs px-2.5 py-1.5 rounded-control border border-border bg-surface text-text hover:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-bright"
          >
            <option value="">Tất cả vùng</option>
            <option value="green">Xanh (Trong ngưỡng / Hiệu quả)</option>
            <option value="yellow">Vàng (Cảnh báo / Một phần)</option>
            <option value="red">Đỏ (Vượt ngưỡng / Chưa hiệu quả)</option>
            <option value="none">Chưa có số liệu</option>
          </select>
        </div>

        {/* Lọc đơn vị (ẩn khi units rỗng) */}
        {units.length > 0 && (
          <div className="w-full sm:w-auto min-w-0">
            <label htmlFor="filter-ind-unit" className="sr-only">
              Đơn vị
            </label>
            <select
              id="filter-ind-unit"
              value={filters.unit ?? ''}
              onChange={(e) => updateFilters({ unit: e.target.value })}
              className="w-full sm:w-auto max-w-full text-xs px-2.5 py-1.5 rounded-control border border-border bg-surface text-text hover:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-bright truncate"
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
      </FilterBar>

      {/* 5. Bảng danh sách chỉ số */}
      {indicators.length === 0 ? (
        <EmptyState
          title="Không có chỉ số rủi ro"
          description="Không tìm thấy chỉ số nào khớp với điều kiện lọc."
        />
      ) : (
        <div className="rounded-card border border-border bg-surface shadow-sm overflow-hidden max-w-full min-w-0">
          <DataTable
            data={indicators}
            columns={columns}
            keyExtractor={(item) => item.indicator.id}
            onRowClick={(item) => setSelectedItem(item)}
            emptyMessage="Không có chỉ số rủi ro"
          />
        </div>
      )}

      {/* RecordDrawer hiển thị chi tiết khi bấm xem */}
      <RecordDrawer
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        title={
          selectedItem && (
            <div className="flex items-center gap-2">
              <span>{selectedItem.indicator.code}</span>
              <ZoneBadge
                kind={selectedItem.indicator.kind}
                zone={selectedItem.indicator.current ? selectedItem.indicator.current.zone : null}
              />
            </div>
          )
        }
        description={
          selectedItem &&
          `Hồ sơ rủi ro: ${selectedItem.riskCode} - ${selectedItem.riskName}`
        }
      >
        {selectedItem && (
          <div className="space-y-6 text-xs">
            {/* Thông tin chung */}
            <div className="space-y-2 p-3.5 rounded bg-bg-tint/40 border border-border">
              <h4 className="font-bold text-brand-navy text-sm">
                {selectedItem.indicator.name}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-text-muted pt-1">
                <div>
                  <span className="font-medium">Loại chỉ số:</span>{' '}
                  <span className="font-semibold text-text uppercase">
                    {selectedItem.indicator.kind}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Tần suất:</span>{' '}
                  <span className="font-semibold text-text">
                    {selectedItem.indicator.frequency}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="font-medium">Công thức:</span>{' '}
                  <span className="font-mono text-text">
                    {selectedItem.indicator.formula}
                  </span>
                </div>
                {selectedItem.indicator.mode === 'manual' && (
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-state-warn-bg text-state-warn-fg border border-state-warn-line/30 font-medium">
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      Chỉ số chọn vùng thủ công (ngưỡng dạng văn bản)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Ba ô ngưỡng */}
            <div>
              <h4 className="font-bold text-text-muted uppercase tracking-wider mb-2">
                Các ngưỡng đánh giá
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded border border-state-ok-line/30 bg-state-ok-bg/30">
                  <span className="font-bold text-state-ok-fg block mb-1">
                    {selectedItem.indicator.kind === 'kri' ? 'Trong ngưỡng (Xanh)' : 'Hiệu quả (Xanh)'}
                  </span>
                  <span className="text-text font-medium">
                    {selectedItem.indicator.thresholds.green}
                  </span>
                </div>

                <div className="p-2.5 rounded border border-state-warn-line/30 bg-state-warn-bg/30">
                  <span className="font-bold text-state-warn-fg block mb-1">
                    {selectedItem.indicator.kind === 'kri' ? 'Cảnh báo (Vàng)' : 'Một phần (Vàng)'}
                  </span>
                  <span className="text-text font-medium">
                    {selectedItem.indicator.thresholds.yellow}
                  </span>
                </div>

                <div className="p-2.5 rounded border border-state-bad-line/30 bg-state-bad-bg/30">
                  <span className="font-bold text-state-bad-fg block mb-1">
                    {selectedItem.indicator.kind === 'kri' ? 'Vượt ngưỡng (Đỏ)' : 'Chưa hiệu quả (Đỏ)'}
                  </span>
                  <span className="text-text font-medium">
                    {selectedItem.indicator.thresholds.red}
                  </span>
                </div>
              </div>
            </div>

            {/* Biểu đồ lịch sử */}
            <div className="pt-2 border-t border-border">
              <IndicatorHistoryChart
                indicatorId={selectedItem.indicator.id}
                indicatorKind={selectedItem.indicator.kind}
              />
            </div>
          </div>
        )}
      </RecordDrawer>

      {/* ReadingForm dialog */}
      {readingFormIndicator && (
        <ReadingForm
          indicator={readingFormIndicator}
          open={!!readingFormIndicator}
          onOpenChange={(open) => !open && setReadingFormIndicator(null)}
          onSuccess={() => {
            setReadingFormIndicator(null);
            router.refresh();
          }}
        />
      )}

      {/* ReadingsHistoryDrawer */}
      {historyIndicator && (
        <ReadingsHistoryDrawer
          indicator={historyIndicator}
          open={!!historyIndicator}
          onOpenChange={(open) => !open && setHistoryIndicator(null)}
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
        description="Bạn có chắc chắn muốn rút lại bản nộp đang chờ duyệt này không? Bản nộp sẽ chuyển sang trạng thái đã rút và không thể khôi phục."
        confirmText="Rút lại"
        variant="danger"
        isSubmitting={isWithdrawing}
        onConfirm={async () => {
          if (!withdrawPendingId) return;
          setIsWithdrawing(true);
          try {
            await apiSend('POST', `/api/readings/${withdrawPendingId}/withdraw`);
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
