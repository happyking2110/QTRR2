'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { components } from '@/lib/api/schema';
import { StatCard } from '@/components/domain/StatCard';
import { HeatMatrix } from '@/components/domain/HeatMatrix';
import { ZoneBadge } from '@/components/domain/ZoneBadge';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { ProgressBar } from '@/components/domain/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatPercent } from '@/lib/format';
import { PageHero } from '@/components/ui/PageHero';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { ProfileStackedBarCharts } from '@/components/domain/ProfileStackedBarCharts';
import { PrintHeader } from '@/components/layout/PrintHeader';
import { ShieldAlert, Activity, Gauge, ClipboardList, CheckCircle2, ChevronRight, Plus, Printer } from 'lucide-react';
import { ProfileFormDrawer } from '@/components/domain/ProfileFormDrawer';

type Overview = components['schemas']['Overview'];
type Heatmap = components['schemas']['Heatmap'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type IndicatorListItem = components['schemas']['IndicatorListItem'];
type ActionListItem = components['schemas']['ActionListItem'];
type CurrentUser = components['schemas']['CurrentUser'];

export interface OverviewViewProps {
  currentUser?: CurrentUser | null;
  overview: Overview;
  heatmap: Heatmap;
  profiles: ProfileSummary[];
  alertKri: IndicatorListItem[];
  urgentActions: ActionListItem[];
}

export default function OverviewView({
  currentUser,
  overview,
  heatmap,
  profiles,
  alertKri,
  urgentActions,
}: OverviewViewProps) {
  const searchParams = useSearchParams();
  const isPrintMode = searchParams?.get('print') === '1';
  const [isAddProfileOpen, setIsAddProfileOpen] = React.useState(false);
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'ban4';

  const periodLabel = overview.period?.label ? overview.period.label.toUpperCase() : 'CHƯA CHỌN KỲ';
  const residualCount = profiles.filter((p) => p.residual !== null).length;

  return (
    <div className="space-y-6">
      {/* Banner nhắc in khi mở bằng ?print=1 */}
      {isPrintMode && (
        <div className="print:hidden rounded-card border border-brand-blue/30 bg-brand-blue/10 p-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 text-xs text-brand-navy">
            <Printer className="w-4 h-4 text-brand-blue shrink-0" aria-hidden="true" />
            <span>
              <strong>Bản in chuẩn A4:</strong> Sử dụng tổ hợp phím <strong>Ctrl + P</strong> (hoặc <strong>Cmd + P</strong> trên macOS) để in hoặc lưu thành file PDF.
            </span>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-control bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy transition shrink-0"
          >
            In trang ngay
          </button>
        </div>
      )}

      {/* Đầu trang bản in chuẩn A4 */}
      <PrintHeader
        title={`Báo cáo Tổng quan Rủi ro Trọng yếu Chu kỳ ${overview.cycle.year}`}
        cycle={overview.cycle.year}
        period={overview.period?.label || 'Toàn chu kỳ'}
        printedBy={currentUser?.fullName}
        forceVisible={isPrintMode}
      />

      {/* Khối giới thiệu đầu trang theo site mẫu */}
      <PageHero
        className="print:hidden"
        eyebrow={`BÁO CÁO RỦI RO TRỌNG YẾU · ${periodLabel}`}
        title={`Tổng quan rủi ro trọng yếu ${overview.cycle.year}`}
        description={`Theo dõi ${String(overview.profileCount).padStart(2, '0')} hồ sơ rủi ro trọng yếu: chỉ số rủi ro chính (KRI), chỉ số kiểm soát chính (KCI) và tiến độ kế hoạch hành động giảm thiểu rủi ro.`}
      />

      {/* 1. Hàng thẻ StatCard (4 thẻ theo site mẫu) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Thẻ 1: Số hồ sơ */}
        <StatCard
          title="Hồ sơ rủi ro trọng yếu"
          value={String(overview.profileCount).padStart(2, '0')}
          icon={<ShieldAlert className="w-5 h-5 text-text-muted/60" aria-hidden="true" />}
          subtitle={`Đã có mức còn lại: ${residualCount}/${overview.profileCount} hồ sơ`}
          href={profiles.length > 0 ? `/profiles/${profiles[0].riskCode}` : '/'}
        />

        {/* Thẻ 2: KRI vượt ngưỡng */}
        <StatCard
          title="KRI vượt ngưỡng"
          icon={<Activity className="w-5 h-5 text-text-muted/60" aria-hidden="true" />}
          value={
            overview.hasApprovedData ? (
              <span data-testid="kri-stat-value" className="flex items-baseline gap-1">
                <span className="text-state-bad-fg font-bold">{overview.kri.red}</span>
                <span className="text-sm font-normal text-text-muted">/ {overview.kri.total}</span>
              </span>
            ) : (
              <span data-testid="kri-stat-value" className="text-sm font-medium text-text-muted leading-tight block">
                Chưa có số liệu
              </span>
            )
          }
          subtitle={
            overview.hasApprovedData
              ? `${overview.kri.yellow} KRI ở vùng cảnh báo`
              : `${overview.kri.total} KRI cần theo dõi`
          }
          href="/indicators?kind=kri"
        />

        {/* Thẻ 3: KCI hiệu quả */}
        <StatCard
          title="KCI hiệu quả"
          icon={<Gauge className="w-5 h-5 text-text-muted/60" aria-hidden="true" />}
          value={
            overview.hasApprovedData ? (
              <span data-testid="kci-stat-value" className="flex items-baseline gap-1">
                <span className="text-state-ok-fg font-bold">{overview.kci.green}</span>
                <span className="text-sm font-normal text-text-muted">/ {overview.kci.total}</span>
              </span>
            ) : (
              <span data-testid="kci-stat-value" className="text-sm font-medium text-text-muted leading-tight block">
                Chưa có số liệu
              </span>
            )
          }
          subtitle={
            overview.hasApprovedData
              ? `${overview.kci.red} kiểm soát chưa hiệu quả`
              : `${overview.kci.total} KCI đang vận hành`
          }
          href="/indicators?kind=kci"
        />

        {/* Thẻ 4: Kế hoạch hành động */}
        <StatCard
          title="Kế hoạch hành động"
          icon={<ClipboardList className="w-5 h-5 text-text-muted/60" aria-hidden="true" />}
          value={
            overview.hasApprovedData && overview.actionProgressAverage !== null ? (
              formatPercent(overview.actionProgressAverage)
            ) : (
              <span className="text-sm font-medium text-text-muted block">
                Chưa có số liệu
              </span>
            )
          }
          subtitle={`Tiến độ bình quân · ${overview.actions.completed}/${overview.actions.total} hoàn thành, ${overview.actions.overdue} quá hạn`}
          href="/actions"
        />
      </div>

      {/* 2. Ma trận rủi ro (bên trái) và Hai biểu đồ cột chồng (bên phải) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ma trận rủi ro 5x5 */}
        <div className="lg:col-span-7">
          <Card>
            <HeatMatrix
              points={heatmap.points}
              impactLevels={heatmap.impactLevels}
              likelihoodLevels={heatmap.likelihoodLevels}
              scaleProvisional={heatmap.scaleProvisional}
            />
          </Card>
        </div>

        {/* Hai biểu đồ cột chồng KRI và KHHĐ theo hồ sơ */}
        <div className="lg:col-span-5">
          <ProfileStackedBarCharts profiles={profiles} />
        </div>
      </div>

      {/* 3. Bảng "Tổng hợp {nn} hồ sơ rủi ro trọng yếu" (rộng hết hàng theo 4.1 mục 4) */}
      <Card
        title={`Tổng hợp ${String(profiles.length).padStart(2, '0')} hồ sơ rủi ro trọng yếu`}
        subtitle={`Chu kỳ ${overview.cycle.year}`}
        className="print:break-before-page"
        action={
          canEdit ? (
            <button
              type="button"
              data-testid="add-profile-button"
              onClick={() => setIsAddProfileOpen(true)}
              className="print:hidden inline-flex items-center gap-1.5 rounded-control bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Thêm hồ sơ</span>
            </button>
          ) : undefined
        }
      >
        {/* Desktop Table View (md và lớn hơn) */}
        <div className="hidden md:block print:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Hồ sơ rủi ro</th>
                <th scope="col" className="px-3 py-3 font-semibold">Tiềm ẩn</th>
                <th scope="col" className="px-3 py-3 font-semibold">Còn lại</th>
                <th scope="col" className="px-3 py-3 font-semibold">KRI</th>
                <th scope="col" className="px-3 py-3 font-semibold">KCI hiệu quả</th>
                <th scope="col" className="px-3 py-3 font-semibold">Tiến độ KH</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {profiles.map((p) => (
                <tr
                  key={p.riskCode}
                  className="group hover:bg-bg-tint/50 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <Link href={`/profiles/${p.riskCode}`} className="block">
                      <div className="font-semibold text-text text-sm group-hover:text-brand-blue-bright transition-colors">
                        <span className="text-brand-navy font-bold">{p.riskCode}</span>
                        <span className="mx-1.5 text-text-muted">·</span>
                        <span>{p.name}</span>
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {p.riskType} · {p.riskZone}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    <Pill levelLabel={p.inherent.levelLabel} />
                    <div className="text-[10px] text-text-muted mt-1 tabular-nums">
                      Khả năng {p.inherent.likelihoodScore} × Tác động {p.inherent.impactScore}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    {p.residual ? (
                      <>
                        <Pill levelLabel={p.residual.levelLabel} />
                        <div className="text-[10px] text-text-muted mt-1 tabular-nums">
                          Khả năng {p.residual.likelihoodScore} × Tác động {p.residual.impactScore}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-text-muted">Chưa nhập</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center text-xs text-state-ok-fg font-medium">
                        <span className="w-2 h-2 rounded-full bg-state-ok-line mr-1" />
                        {p.kri.green}
                      </span>
                      <span className="inline-flex items-center text-xs text-state-warn-fg font-medium">
                        <span className="w-2 h-2 rounded-full bg-state-warn-line mr-1" />
                        {p.kri.yellow}
                      </span>
                      <span className="inline-flex items-center text-xs text-state-bad-fg font-medium">
                        <span className="w-2 h-2 rounded-full bg-state-bad-line mr-1" />
                        {p.kri.red}
                      </span>
                    </div>
                    {p.kri.noData > 0 && (
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {p.kri.noData} chưa có số liệu
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    <div className="font-semibold text-text tabular-nums">
                      {p.kci.green}/{p.kci.total}
                    </div>
                    {p.kci.red > 0 ? (
                      <div className="text-[10px] text-state-bad-fg mt-0.5">
                        ({p.kci.red} chưa hiệu quả)
                      </div>
                    ) : (
                      <div className="text-[10px] text-text-muted mt-0.5">
                        (0 chưa hiệu quả)
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3.5 min-w-[130px]">
                    {p.actionProgress !== null ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[11px] text-text-muted tabular-nums">
                            {p.actions.completed}/{p.actions.total} KH
                          </span>
                          <span className="font-semibold text-text tabular-nums">
                            {formatPercent(p.actionProgress)}
                          </span>
                        </div>
                        <ProgressBar value={p.actionProgress} showLabel={false} />
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <Link
                      href={`/profiles/${p.riskCode}`}
                      className="inline-flex items-center text-xs font-semibold text-brand-blue hover:text-brand-navy group-hover:translate-x-0.5 transition-transform"
                    >
                      Chi tiết
                      <ChevronRight className="w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (nhỏ hơn md) */}
        <div className="md:hidden print:hidden divide-y divide-border/60">
          {profiles.map((p) => (
            <Link
              key={p.riskCode}
              href={`/profiles/${p.riskCode}`}
              className="block py-3.5 first:pt-0 last:pb-0 hover:bg-bg-tint/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-text text-sm">
                    <span className="text-brand-navy font-bold">{p.riskCode}</span>
                    <span className="mx-1 text-text-muted">·</span>
                    <span>{p.name}</span>
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {p.riskType} · {p.riskZone}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted mt-1 shrink-0" aria-hidden="true" />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-text-muted">Tiềm ẩn:</span>
                  <Pill levelLabel={p.inherent.levelLabel} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-text-muted">Còn lại:</span>
                  {p.residual ? (
                    <Pill levelLabel={p.residual.levelLabel} />
                  ) : (
                    <span className="text-[11px] text-text-muted">Chưa nhập</span>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/40">
                <div>
                  <span className="text-[10px] text-text-muted block">KRI (Xanh/Vàng/Đỏ)</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-state-ok-fg font-medium">{p.kri.green}</span>
                    <span>/</span>
                    <span className="text-state-warn-fg font-medium">{p.kri.yellow}</span>
                    <span>/</span>
                    <span className="text-state-bad-fg font-medium">{p.kri.red}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-text-muted block">KCI hiệu quả</span>
                  <span className="font-semibold text-text tabular-nums">
                    {p.kci.green}/{p.kci.total}
                  </span>
                </div>
              </div>

              {p.actionProgress !== null && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-muted">Tiến độ KH</span>
                    <span className="font-semibold text-text">{formatPercent(p.actionProgress)}</span>
                  </div>
                  <ProgressBar value={p.actionProgress} showLabel={false} />
                </div>
              )}
            </Link>
          ))}
        </div>
      </Card>

      {/* 4. Hàng cuối: Hai danh sách "KRI cần lưu ý" và "Kế hoạch quá hạn / có nguy cơ chậm" */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start print:break-before-page">
        {/* Khối 1: KRI cần lưu ý */}
        <Card
          title={`KRI cần lưu ý (${alertKri.length})`}
          subtitle="Các chỉ số rủi ro chính đang ở vùng cảnh báo hoặc vượt ngưỡng"
          action={
            <Link
              href="/indicators?kind=kri&zone=red"
              className="text-xs font-semibold text-brand-blue hover:text-brand-navy inline-flex items-center gap-1 transition-colors"
            >
              <span>Xem tất cả</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {!overview.hasApprovedData ? (
            <div className="rounded-lg border border-dashed border-border bg-bg-tint/40 p-6 text-center text-xs text-text-muted">
              <p className="font-semibold text-text">Chưa có số liệu đã duyệt cho kỳ này</p>
              <p className="mt-1">
                Đơn vị phụ trách vui lòng vào mục Chỉ số để kiểm tra và cập nhật số liệu.
              </p>
            </div>
          ) : alertKri.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-8 h-8 text-state-ok-line" aria-hidden="true" />}
              title="Không có KRI cần theo dõi"
              description="Hiện không có chỉ số rủi ro chính nào ở vùng cảnh báo hoặc vượt ngưỡng."
            />
          ) : (
            <div className="divide-y divide-border/60">
              {[...alertKri]
                .sort((a, b) => {
                  const zoneA = a.indicator.current?.zone;
                  const zoneB = b.indicator.current?.zone;
                  if (zoneA === 'red' && zoneB !== 'red') return -1;
                  if (zoneA !== 'red' && zoneB === 'red') return 1;
                  return 0;
                })
                .slice(0, 10)
                .map(({ riskCode, indicator }) => (
                  <div
                    key={indicator.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 hover:bg-bg-tint/30 px-2 -mx-2 rounded transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-text text-xs sm:text-sm truncate" title={indicator.name}>
                        {indicator.name}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5 truncate">
                        <span className="font-mono text-brand-navy font-medium">{indicator.code}</span>
                        <span className="mx-1">·</span>
                        <Link href={`/profiles/${riskCode}`} className="hover:underline">
                          {riskCode}
                        </Link>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-semibold text-xs sm:text-sm tabular-nums text-text">
                        {indicator.current ? indicator.current.valueText : '—'}
                      </span>
                      <ZoneBadge kind="kri" zone={indicator.current ? indicator.current.zone : null} />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>

        {/* Khối 2: Kế hoạch quá hạn / có nguy cơ chậm */}
        <Card
          title={`Kế hoạch quá hạn / có nguy cơ chậm (${urgentActions.length})`}
          subtitle="Các kế hoạch hành động đang quá hạn hoặc có nguy cơ chậm tiến độ"
          action={
            <Link
              href="/actions?status=overdue"
              className="text-xs font-semibold text-brand-blue hover:text-brand-navy inline-flex items-center gap-1 transition-colors"
            >
              <span>Xem tất cả KH</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {urgentActions.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-8 h-8 text-state-ok-line" aria-hidden="true" />}
              title="Không có KH quá hạn hay có nguy cơ chậm"
              description="Tất cả các kế hoạch hành động đang được thực hiện theo đúng tiến độ dự kiến."
            />
          ) : (
            <div className="divide-y divide-border/60">
              {urgentActions.slice(0, 10).map(({ riskCode, action }) => (
                <div
                  key={action.code}
                  className="py-3 first:pt-0 last:pb-0 space-y-2 hover:bg-bg-tint/30 px-2 -mx-2 rounded transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-text text-xs sm:text-sm line-clamp-1" title={action.description}>
                      {action.description}
                    </div>
                    <StatusBadge status={action.status} className="shrink-0" />
                  </div>

                  <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-brand-navy font-medium">{action.code}</span>
                    <span>·</span>
                    <Link href={`/profiles/${riskCode}`} className="hover:underline">
                      {riskCode}
                    </Link>
                    <span>·</span>
                    <span>{action.responsibilityText || 'Chưa gán'}</span>
                    <span>·</span>
                    <span className="tabular-nums">Hạn {action.dueText || formatDate(action.dueDate)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <ProgressBar value={action.progress} showLabel={false} />
                    </div>
                    <span className="text-[11px] font-semibold text-text tabular-nums shrink-0">
                      {formatPercent(action.progress)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 5. Dòng chân trang */}
      <div className="pt-2 text-center text-xs text-text-muted">
        {overview.asOfDate ? (
          <span>Số liệu đã duyệt đến ngày {formatDate(overview.asOfDate)}</span>
        ) : (
          <span>Chưa có số liệu đã duyệt</span>
        )}
      </div>

      {canEdit && (
        <ProfileFormDrawer
          open={isAddProfileOpen}
          onOpenChange={setIsAddProfileOpen}
          heatmap={heatmap}
          cycle={
            searchParams?.get('cycle')
              ? parseInt(searchParams.get('cycle')!, 10)
              : overview.period?.key
                ? parseInt(overview.period.key.slice(0, 4), 10)
                : undefined
          }
        />
      )}
    </div>
  );
}
