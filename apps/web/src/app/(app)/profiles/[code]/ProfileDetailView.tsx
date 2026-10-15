'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { components } from '@/lib/api/schema';
import { Pill } from '@/components/ui/Pill';
import { ZoneBadge } from '@/components/domain/ZoneBadge';
import { StatusBadge } from '@/components/domain/StatusBadge';
import { ProgressBar } from '@/components/domain/ProgressBar';
import { IndicatorHistoryChart } from '@/components/domain/IndicatorHistoryChart';
import { ApprovalBadge } from '@/components/domain/ApprovalBadge';
import { ReadingForm } from '@/components/domain/ReadingForm';
import { ReadingsHistoryDrawer } from '@/components/domain/ReadingsHistoryDrawer';
import { TaskUpdateForm, type TaskUpdateFormTask } from '@/components/domain/TaskUpdateForm';
import { TaskUpdatesHistoryDrawer } from '@/components/domain/TaskUpdatesHistoryDrawer';
import { ResidualAssessmentDialog } from '@/components/domain/ResidualAssessmentDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiSend, ApiClientError } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatPercent, formatNumber } from '@/lib/format';
import {
  ArrowLeft,
  ArrowRight,
  Printer,
  ChevronDown,
  ChevronRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Link as LinkIcon,
  Download,
  Split,
  Sliders,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';
import { ProfileFormDrawer } from '@/components/domain/ProfileFormDrawer';
import { CauseFormDrawer } from '@/components/domain/CauseFormDrawer';
import { ImpactFormDrawer } from '@/components/domain/ImpactFormDrawer';
import { ControlFormDrawer, type ControlFormDrawerProps } from '@/components/domain/ControlFormDrawer';
import { ActionFormDrawer, type ActionFormDrawerProps } from '@/components/domain/ActionFormDrawer';
import { IndicatorFormDrawer, type IndicatorFormDrawerProps } from '@/components/domain/IndicatorFormDrawer';
import { IndicatorTargetsDrawer } from '@/components/domain/IndicatorTargetsDrawer';
import { LinkCodesDialog } from '@/components/domain/LinkCodesDialog';
import { TaskFormDialog } from '@/components/domain/TaskFormDialog';
import { TaskSplitDialog } from '@/components/domain/TaskSplitDialog';
import { PrintHeader } from '@/components/layout/PrintHeader';

type ProfileDetail = components['schemas']['ProfileDetail'];
type IndicatorHistoryItem = components['schemas']['IndicatorHistoryItem'];
type Indicator = components['schemas']['Indicator'];
type CurrentUser = components['schemas']['CurrentUser'];
type Heatmap = components['schemas']['Heatmap'];
type UnitSummary = components['schemas']['UnitSummary'];

export interface ProfileDetailViewProps {
  currentUser?: CurrentUser | null;
  heatmap?: Heatmap | null;
  units?: UnitSummary[];
  detail: ProfileDetail;
  indicatorHistories?: Record<string, IndicatorHistoryItem[]>;
}

function getNextCode(prefix: string, existingCodes: string[]): string {
  let max = 0;
  const escapedPrefix = prefix.replace(/\./g, '\\.');
  for (const c of existingCodes) {
    const match = c.match(new RegExp(`^${escapedPrefix}(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

function formatIndicatorThresholds(ind: Indicator): string | null {
  if (
    ind.yellowAt !== null &&
    ind.yellowAt !== undefined &&
    ind.redAt !== null &&
    ind.redAt !== undefined
  ) {
    const yellowStr = formatNumber(ind.yellowAt);
    const redStr = formatNumber(ind.redAt);
    if (ind.direction === 'higher_is_worse') {
      return `≥ ${yellowStr} / ${redStr}`;
    }
    if (ind.direction === 'lower_is_worse') {
      return `≤ ${yellowStr} / ${redStr}`;
    }
    return `${yellowStr} / ${redStr}`;
  }
  return null;
}

function formatValueWithUnit(valText?: string | null, unit?: string | null): string {
  if (!valText) return '—';
  if (!unit) return valText;
  if (unit === '%') {
    return valText.endsWith('%') ? valText : `${valText}%`;
  }
  return valText.endsWith(unit) ? valText : `${valText} ${unit}`;
}

function KciZoneBadge({ zone }: { zone: 'green' | 'yellow' | 'red' | null }) {
  if (!zone) {
    return <span className="text-text-muted">—</span>;
  }
  if (zone === 'green') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-ok-bg text-state-ok-fg border border-state-ok-line/30">
        <CheckCircle2 className="w-3.5 h-3.5 text-state-ok-line" aria-hidden="true" />
        <span>Hiệu quả</span>
      </span>
    );
  }
  if (zone === 'yellow') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-warn-bg text-state-warn-fg border border-state-warn-line/30">
        <AlertTriangle className="w-3.5 h-3.5 text-state-warn-line" aria-hidden="true" />
        <span>Cần cải thiện</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-state-bad-bg text-state-bad-fg border border-state-bad-line/30">
      <AlertCircle className="w-3.5 h-3.5 text-state-bad-line" aria-hidden="true" />
      <span>Không hiệu quả</span>
    </span>
  );
}

function Sparkline({ data }: { data?: IndicatorHistoryItem[] }) {
  if (!data) return <span className="text-text-muted">—</span>;
  const validPoints = data.filter((d) => d.valueNum !== null && d.valueNum !== undefined);
  if (validPoints.length < 2) return <span className="text-text-muted">—</span>;

  const values = validPoints.map((d) => d.valueNum as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 64;
  const height = 18;
  const padding = 2;

  const points = values.map((val, idx) => {
    const x = padding + (idx / (values.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const lastCoords = points[points.length - 1].split(',');
  const lastZone = validPoints[validPoints.length - 1].zone;
  const dotColor =
    lastZone === 'green' ? '#2E7D32' : lastZone === 'yellow' ? '#F9A825' : '#C62828';

  return (
    <svg
      width={width}
      height={height}
      className="inline-block overflow-visible align-middle"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="#5B6470"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
      <circle cx={lastCoords[0]} cy={lastCoords[1]} r="2.5" fill={dotColor} />
    </svg>
  );
}

export default function ProfileDetailView({
  currentUser,
  heatmap,
  units = [],
  detail,
  indicatorHistories = {},
}: ProfileDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCycleYear = searchParams?.get('cycle')
    ? parseInt(searchParams.get('cycle')!, 10)
    : (detail.period?.key ? parseInt(detail.period.key.slice(0, 4), 10) : 2026);
  const cycleParam = String(activeCycleYear);
  const periodParam = searchParams?.get('period') || '';
  const isPrintMode = searchParams?.get('print') === '1';

  const isAdmin = currentUser?.role === 'admin';
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'ban4';
  const canExportBM06 = currentUser?.role !== 'viewer';
  const { profile } = detail;
  const kriIndicators = (detail.indicators || []).filter((i) => i.kind === 'kri');
  const kciIndicators = (detail.indicators || []).filter((i) => i.kind === 'kci');

  const [isBm06Expanded, setIsBm06Expanded] = useState(false);
  const showBm06 = isPrintMode || isBm06Expanded;
  const [targetsDrawerIndicator, setTargetsDrawerIndicator] = useState<Indicator | null>(null);

  const [selectedKriId, setSelectedKriId] = useState<string>(
    kriIndicators[0]?.id || '',
  );
  const [expandedActions, setExpandedActions] = useState<Record<string, boolean>>({});
  const [expandedSourceText, setExpandedSourceText] = useState<Record<string, boolean>>({});
  const [expandedCauses, setExpandedCauses] = useState<Record<string, boolean>>({});
  const [expandedImpacts, setExpandedImpacts] = useState<Record<string, boolean>>({});
  const [expandedDescription, setExpandedDescription] = useState(false);

  // Modal and drawer states for reading submissions
  const [readingFormIndicator, setReadingFormIndicator] = useState<Indicator | null>(null);
  const [historyIndicator, setHistoryIndicator] = useState<Indicator | null>(null);
  const [withdrawPendingId, setWithdrawPendingId] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Modal and drawer states for task update submissions
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
  const [withdrawTaskPendingId, setWithdrawTaskPendingId] = useState<string | null>(null);
  const [isWithdrawingTask, setIsWithdrawingTask] = useState(false);

  // Residual assessment dialog state
  const [residualDialogOpen, setResidualDialogOpen] = useState(false);
  const [currentResidual, setCurrentResidual] = useState(profile.residual);
  const [residualHistoryList, setResidualHistoryList] = useState(detail.residualHistory || []);
  const canAssessResidual = currentUser?.role === 'admin' || currentUser?.role === 'ban4';

  useEffect(() => {
    setCurrentResidual(profile.residual);
    setResidualHistoryList(detail.residualHistory || []);
  }, [profile.residual, detail.residualHistory]);

  // States cho các drawer & modal chỉnh sửa
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const [causeDrawer, setCauseDrawer] = useState<{
    open: boolean;
    initialCause: { code: string; group: string; description: string } | null;
    suggestedCode: string;
  }>({ open: false, initialCause: null, suggestedCode: '' });

  const [impactDrawer, setImpactDrawer] = useState<{
    open: boolean;
    initialImpact: { code: string; group: string; description: string; level: string } | null;
    suggestedCode: string;
  }>({ open: false, initialImpact: null, suggestedCode: '' });

  const [controlDrawer, setControlDrawer] = useState<{
    open: boolean;
    initialControl: ControlFormDrawerProps['initialControl'];
    suggestedCode: string;
  }>({ open: false, initialControl: null, suggestedCode: '' });

  const [actionDrawer, setActionDrawer] = useState<{
    open: boolean;
    initialAction: ActionFormDrawerProps['initialAction'];
    suggestedCode: string;
  }>({ open: false, initialAction: null, suggestedCode: '' });

  const [indicatorDrawer, setIndicatorDrawer] = useState<{
    open: boolean;
    kind: 'kri' | 'kci';
    initialIndicator: IndicatorFormDrawerProps['initialIndicator'];
    suggestedCode: string;
  }>({ open: false, kind: 'kri', initialIndicator: null, suggestedCode: '' });

  const [taskDialog, setTaskDialog] = useState<{
    open: boolean;
    actionCode: string;
    initialTask: { id: string; name: string; unitCode: string | null; dueDate: string | null } | null;
  }>({ open: false, actionCode: '', initialTask: null });

  const [splitTaskDialog, setSplitTaskDialog] = useState<{
    open: boolean;
    task: {
      id: string;
      name: string;
      sourceText?: string | null;
      unit?: { code: string; name: string } | null;
      dueDate?: string | null;
    };
  } | null>(null);

  const [linkCodesDialog, setLinkCodesDialog] = useState<{
    open: boolean;
    title: string;
    description?: string;
    currentLinkedCodes: string[];
    availableItems: { code: string; text?: string }[];
    onSave: (codes: string[]) => Promise<void>;
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'profile' | 'cause' | 'impact' | 'control' | 'action' | 'indicator' | 'task';
    code: string;
    name?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<{
    code?: string;
    message?: string;
    details?: unknown;
  } | null>(null);

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { type, code } = deleteConfirm;
      if (type === 'profile') {
        await apiSend('DELETE', `/api/profiles/${encodeURIComponent(profile.riskCode)}?cycle=${cycleParam}`);
        setDeleteConfirm(null);
        router.push(cycleParam ? `/?cycle=${cycleParam}` : '/');
        return;
      }
      if (type === 'cause') {
        await apiSend('DELETE', `/api/profiles/${encodeURIComponent(profile.riskCode)}/causes/${encodeURIComponent(code)}?cycle=${cycleParam}`);
      } else if (type === 'impact') {
        await apiSend('DELETE', `/api/profiles/${encodeURIComponent(profile.riskCode)}/impacts/${encodeURIComponent(code)}?cycle=${cycleParam}`);
      } else if (type === 'control') {
        await apiSend('DELETE', `/api/profiles/${encodeURIComponent(profile.riskCode)}/controls/${encodeURIComponent(code)}?cycle=${cycleParam}`);
      } else if (type === 'action') {
        await apiSend('DELETE', `/api/profiles/${encodeURIComponent(profile.riskCode)}/actions/${encodeURIComponent(code)}?cycle=${cycleParam}`);
      } else if (type === 'indicator') {
        await apiSend('DELETE', `/api/profiles/${encodeURIComponent(profile.riskCode)}/indicators/${encodeURIComponent(code)}?cycle=${cycleParam}`);
      } else if (type === 'task') {
        await apiSend('DELETE', `/api/tasks/${encodeURIComponent(code)}`);
      }
      setDeleteConfirm(null);
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setDeleteError({
          code: err.code,
          message: err.message,
          details: err.details,
        });
      } else {
        setDeleteError({
          code: 'INTERNAL',
          message: 'Không thể xóa mục do xảy ra lỗi máy chủ.',
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (kriIndicators.length > 0 && !selectedKriId) {
      setSelectedKriId(kriIndicators[0].id);
    }
  }, [kriIndicators, selectedKriId]);



  const toggleAction = (code: string) => {
    setExpandedActions((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const toggleSourceText = (code: string) => {
    setExpandedSourceText((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const toggleCause = (code: string) => {
    setExpandedCauses((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const toggleImpact = (code: string) => {
    setExpandedImpacts((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const selectedKri = kriIndicators.find((i) => i.id === selectedKriId);

  // Nối toàn bộ mô tả (không cắt bỏ dòng)
  const descriptionLines = (detail.description || '').split('\n').filter(Boolean);
  const fullDescription = descriptionLines.join(' ');

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
        title={`Hồ sơ ${profile.riskCode} – ${profile.name}`}
        cycle={cycleParam}
        period={periodParam || 'Kỳ hiện hành'}
        printedBy={currentUser?.fullName}
        forceVisible={isPrintMode}
      />

      {/* Liên kết quay lại Tổng quan */}
      {!isPrintMode && (
        <div className="print:hidden">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:text-brand-navy transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tổng quan</span>
          </Link>
        </div>
      )}

      {/* 1. THẺ TÓM TẮT HỒ SƠ */}
      <section id="summary" className="scroll-mt-28">
        <Card className="p-6">
          <div className="flex flex-col gap-5">
            {/* Hàng đầu: Eyebrow, tiêu đề và nút In */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-blue-bright">
                  HỒ SƠ RỦI RO {profile.riskCode}
                </span>
                <div className={cn("flex flex-wrap items-center gap-2", isPrintMode && "hidden", "print:hidden")}>
                  {canExportBM06 && (
                    <a
                      href={`/api/export/profile/${encodeURIComponent(profile.riskCode)}?cycle=${cycleParam}${
                        periodParam ? `&period=${periodParam}` : ''
                      }`}
                      data-testid="export-bm06-button"
                      className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-brand-blue hover:bg-bg-tint transition"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Xuất BM06</span>
                    </a>
                  )}
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        data-testid="edit-profile-button"
                        onClick={() => setIsEditProfileOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-control bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy transition"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        data-testid="delete-profile-button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteConfirm({
                            type: 'profile',
                            code: profile.riskCode,
                            name: `hồ sơ ${profile.riskCode} (${profile.name})`,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-control border border-state-bad-line/40 bg-surface px-3 py-1.5 text-xs font-semibold text-state-bad-fg hover:bg-state-bad-bg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Xóa</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-bg-tint transition"
                  >
                    <Printer className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                    <span>In trang</span>
                  </button>
                </div>
              </div>

              <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-text leading-tight">
                {profile.name}
              </h1>

              {fullDescription && (
                <div className="mt-2 text-sm text-text-muted leading-relaxed">
                  <span
                    className={cn(
                      !expandedDescription && descriptionLines.length > 2 && 'line-clamp-2 sm:line-clamp-3',
                    )}
                  >
                    {fullDescription}
                  </span>{' '}
                  {descriptionLines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDescription(!expandedDescription)}
                      className="font-medium text-brand-blue hover:underline ml-1 cursor-pointer"
                    >
                      {expandedDescription ? 'Thu gọn' : 'Xem thêm'}
                    </button>
                  )}
                  {descriptionLines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsBm06Expanded(true);
                        setTimeout(() => {
                          const el = document.getElementById('general');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }, 50);
                      }}
                      className="font-medium text-brand-blue hover:underline ml-2 cursor-pointer"
                    >
                      Xem đầy đủ
                    </button>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <span>
                  {profile.riskType} · {profile.riskZone} · {profile.riskGroup}
                </span>
                <span>·</span>
                <span>
                  Chủ rủi ro: <strong className="text-text">{profile.owner}</strong>
                </span>
                <span>·</span>
                <span className="font-mono">Mã HSRR: {profile.hsrrCode}</span>
              </div>
            </div>

            {/* Hai ô mức rủi ro nối mũi tên (Không có ô Rủi ro mục tiêu) */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {/* Ô 1: Tiềm ẩn */}
              <div className="rounded-xl border border-border/80 bg-bg-tint/40 p-3.5 min-w-[170px]">
                <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted block">
                  Rủi ro tiềm ẩn
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <Pill score={profile.inherent.score} levelLabel={profile.inherent.levelLabel} />
                </div>
                <div className="mt-1 text-[11px] text-text-muted tabular-nums">
                  K{profile.inherent.likelihoodScore} × T{profile.inherent.impactScore}
                </div>
              </div>

              <ArrowRight className="w-5 h-5 text-text-muted/60 shrink-0" aria-hidden="true" />

              {/* Ô 2: Còn lại */}
              <div className="rounded-xl border border-border/80 bg-bg-tint/40 p-3.5 min-w-[170px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted block">
                    Rủi ro còn lại
                  </span>
                  {canAssessResidual && (
                    <button
                      type="button"
                      data-testid="open-residual-dialog-btn"
                      onClick={() => setResidualDialogOpen(true)}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Nhập mức còn lại
                    </button>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {currentResidual ? (
                    <Pill score={currentResidual.score} levelLabel={currentResidual.levelLabel} />
                  ) : (
                    <span className="text-xs text-text-muted">Chưa nhập</span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-text-muted tabular-nums">
                  {currentResidual
                    ? `K${currentResidual.likelihoodScore} × T${currentResidual.impactScore}`
                    : 'Chưa đánh giá mức còn lại'}
                </div>
              </div>
            </div>

            {/* Hai cột nguyên nhân chính và hậu quả tiềm ẩn */}
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border/70 pt-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Nguyên nhân chính
                </h2>
                {detail.causes && detail.causes.length > 0 ? (
                  <ul className="mt-2 space-y-2 text-xs text-text">
                    {detail.causes.map((c) => {
                      const text = c.description
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .join(' ');
                      const isLong = text.length > 110 || c.description.includes('\n');
                      const isExpanded = !!expandedCauses[c.code];

                      return (
                        <li key={c.code} className="flex items-start gap-1.5">
                          <span className="text-text-muted shrink-0">•</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-[11px] text-text-muted mr-1">
                              [{c.code}]
                            </span>
                            <span
                              className={cn(
                                'text-text',
                                !isExpanded && isLong && 'line-clamp-2 sm:line-clamp-3',
                              )}
                            >
                              {text}
                            </span>
                            {isLong && (
                              <button
                                type="button"
                                onClick={() => toggleCause(c.code)}
                                className="inline-block ml-1.5 text-[11px] font-semibold text-brand-blue hover:underline focus:outline-none cursor-pointer"
                              >
                                {isExpanded ? 'Thu gọn' : 'Xem thêm'}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-text-muted">Chưa có thông tin nguyên nhân</p>
                )}
              </div>

              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Hậu quả tiềm ẩn
                </h2>
                {detail.impacts && detail.impacts.length > 0 ? (
                  <ul className="mt-2 space-y-2 text-xs text-text">
                    {detail.impacts.map((i) => {
                      const text = i.description
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .join(' ');
                      const isLong = text.length > 110 || i.description.includes('\n');
                      const isExpanded = !!expandedImpacts[i.code];

                      return (
                        <li key={i.code} className="flex items-start gap-1.5">
                          <span className="text-text-muted shrink-0">•</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-[11px] text-text-muted mr-1">
                              [{i.code}]
                            </span>
                            <span
                              className={cn(
                                'text-text',
                                !isExpanded && isLong && 'line-clamp-2 sm:line-clamp-3',
                              )}
                            >
                              {text}
                            </span>
                            {i.level && (
                              <span className="ml-1 text-[11px] text-text-muted font-medium whitespace-nowrap">
                                (Mức: {i.level})
                              </span>
                            )}
                            {isLong && (
                              <button
                                type="button"
                                onClick={() => toggleImpact(i.code)}
                                className="inline-block ml-1.5 text-[11px] font-semibold text-brand-blue hover:underline focus:outline-none cursor-pointer"
                              >
                                {isExpanded ? 'Thu gọn' : 'Xem thêm'}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-text-muted">Chưa có thông tin hậu quả</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </section>



      {/* 2. KHỐI CHỈ SỐ RỦI RO CHÍNH (KRI) */}
      <section id="kri" className="scroll-mt-28 print:break-before-page">
        <Card
          title="Chỉ số rủi ro chính (KRI)"
          subtitle="Chọn một KRI để xem diễn biến các kỳ so với ngưỡng"
          action={
            isAdmin ? (
              <button
                type="button"
                data-testid="add-kri-button"
                onClick={() => {
                  const nextCode = getNextCode(`${profile.riskCode}.KRI`, kriIndicators.map((i) => i.code));
                  setIndicatorDrawer({
                    open: true,
                    kind: 'kri',
                    initialIndicator: null,
                    suggestedCode: nextCode,
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-control bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy transition"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Thêm KRI</span>
              </button>
            ) : undefined
          }
          badge={
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center text-state-ok-fg font-medium">
                <span className="w-2 h-2 rounded-full bg-state-ok-line mr-1" />
                {profile.kri.green}
              </span>
              <span className="inline-flex items-center text-state-warn-fg font-medium">
                <span className="w-2 h-2 rounded-full bg-state-warn-line mr-1" />
                {profile.kri.yellow}
              </span>
              <span className="inline-flex items-center text-state-bad-fg font-medium">
                <span className="w-2 h-2 rounded-full bg-state-bad-line mr-1" />
                {profile.kri.red}
              </span>
              {profile.kri.noData > 0 && (
                <span className="text-text-muted font-medium">
                  ({profile.kri.noData} chưa có số liệu)
                </span>
              )}
            </div>
          }
        >
          {kriIndicators.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-8 h-8 text-text-muted" aria-hidden="true" />}
              title="Chưa có chỉ số KRI"
              description="Hồ sơ này hiện chưa thiết lập chỉ số rủi ro chính nào."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Bảng KRI */}
              <div className="lg:col-span-7 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 font-semibold">KRI</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Ngưỡng</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Hiện tại</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Xu hướng</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Trạng thái</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Bản nộp</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {kriIndicators.map((kri) => {
                      const isSelected = kri.id === selectedKriId;
                      const hasSubmit = Boolean(kri.submitPeriodKeys && kri.submitPeriodKeys.length > 0);
                      const withdrawable = kri.pendingSubmissions?.find((p) => p.canWithdraw);
                      const isViewer = currentUser?.role === 'viewer';
                      const numericThresholds = formatIndicatorThresholds(kri);

                      return (
                        <tr
                          key={kri.id}
                          onClick={() => setSelectedKriId(kri.id)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            isSelected
                              ? 'bg-brand-blue-bright/10 ring-1 ring-inset ring-brand-blue-bright/30'
                              : 'hover:bg-bg-tint/40',
                          )}
                        >
                          <td className="px-3 py-3">
                            <div className="font-semibold text-text">{kri.name}</div>
                            <div className="text-[11px] text-text-muted mt-0.5">
                              <span className="font-mono text-brand-navy">{kri.code}</span>
                              <span className="mx-1">·</span>
                              <span>{kri.frequency}</span>
                              {kri.direction && (
                                <>
                                  <span className="mx-1">·</span>
                                  <span>
                                    {kri.direction === 'higher_is_worse'
                                      ? 'Càng cao càng xấu'
                                      : 'Càng thấp càng xấu'}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-[11px]">
                            {numericThresholds ? (
                              <span className="font-semibold text-text font-mono text-[11px]">
                                {numericThresholds}
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-text-muted">
                                  <span className="w-1.5 h-1.5 rounded-full bg-state-ok-line shrink-0" />
                                  <span className="truncate max-w-[130px]" title={kri.thresholds?.green || 'Trong ngưỡng'}>
                                    {kri.thresholds?.green || 'Trong ngưỡng'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-text-muted">
                                  <span className="w-1.5 h-1.5 rounded-full bg-state-warn-line shrink-0" />
                                  <span className="truncate max-w-[130px]" title={kri.thresholds?.yellow || 'Cảnh báo'}>
                                    {kri.thresholds?.yellow || 'Cảnh báo'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-text-muted">
                                  <span className="w-1.5 h-1.5 rounded-full bg-state-bad-line shrink-0" />
                                  <span className="truncate max-w-[130px]" title={kri.thresholds?.red || 'Vượt ngưỡng'}>
                                    {kri.thresholds?.red || 'Vượt ngưỡng'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 font-semibold text-text tabular-nums whitespace-nowrap">
                            {kri.current ? formatValueWithUnit(kri.current.valueText, kri.unitLabel) : '—'}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <Sparkline data={indicatorHistories[kri.id]} />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <ZoneBadge
                              kind="kri"
                              zone={kri.current ? kri.current.zone : null}
                            />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {kri.pendingSubmissions && kri.pendingSubmissions.length > 0 ? (
                              <ApprovalBadge status="pending" />
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {hasSubmit && (
                                <button
                                  type="button"
                                  onClick={() => setReadingFormIndicator(kri)}
                                  className="px-2 py-0.5 text-xs font-semibold rounded bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-xs"
                                >
                                  Nhập
                                </button>
                              )}
                              {withdrawable && (
                                <button
                                  type="button"
                                  onClick={() => setWithdrawPendingId(withdrawable.id)}
                                  className="px-2 py-0.5 text-xs font-medium rounded border border-state-bad-line/40 text-state-bad-fg hover:bg-state-bad-bg transition"
                                >
                                  Rút
                                </button>
                              )}
                              {!isViewer && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryIndicator(kri)}
                                  className="px-2 py-0.5 text-xs font-medium rounded border border-border text-text hover:bg-bg-tint transition"
                                >
                                  Lịch sử
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  data-testid={`targets-kri-${kri.code}`}
                                  onClick={() => setTargetsDrawerIndicator(kri)}
                                  className="p-1 text-text-muted hover:text-brand-blue rounded"
                                  title="Thiết lập ngưỡng và mục tiêu"
                                >
                                  <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  data-testid={`edit-kri-${kri.code}`}
                                  onClick={() => {
                                    setIndicatorDrawer({
                                      open: true,
                                      kind: 'kri',
                                      initialIndicator: {
                                        code: kri.code,
                                        kind: 'kri',
                                        name: kri.name,
                                        formula: kri.formula,
                                        frequency: kri.frequency,
                                        thresholds: kri.thresholds,
                                        note: kri.note,
                                      },
                                      suggestedCode: kri.code,
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-brand-blue rounded"
                                  title="Sửa KRI"
                                >
                                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  type="button"
                                  data-testid={`delete-kri-${kri.code}`}
                                  onClick={() => {
                                    setDeleteError(null);
                                    setDeleteConfirm({
                                      type: 'indicator',
                                      code: kri.code,
                                      name: `chỉ số KRI ${kri.code}`,
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-state-bad-fg rounded"
                                  title="Xóa KRI"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Ngăn chi tiết KRI */}
              <div className="lg:col-span-5 rounded-xl border border-border bg-bg-tint/30 p-4 space-y-3">
                {selectedKri ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-brand-navy">
                          {selectedKri.code}
                        </span>
                        {selectedKri.mode === 'manual' && (
                          <span className="rounded bg-state-warn-bg px-2 py-0.5 text-[10px] font-semibold text-state-warn-fg">
                            Chọn vùng thủ công
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 font-semibold text-text text-sm">
                        {selectedKri.name}
                      </h3>
                      {selectedKri.formula && (
                        <p className="mt-1 text-xs text-text-muted italic">
                          Công thức: {selectedKri.formula}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-text-muted">
                        Đơn vị phụ trách:{' '}
                        <strong className="text-text">
                          {selectedKri.ownerUnit ? selectedKri.ownerUnit.name : 'Chưa gán'}
                        </strong>
                      </p>
                      {selectedKri.dataSource && (
                        <p className="mt-1 text-xs text-text-muted">
                          Nguồn dữ liệu: <strong className="text-text">{selectedKri.dataSource}</strong>
                        </p>
                      )}
                      {/* Thao tác cho KRI đang chọn */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {Boolean(selectedKri.submitPeriodKeys && selectedKri.submitPeriodKeys.length > 0) && (
                          <button
                            type="button"
                            onClick={() => setReadingFormIndicator(selectedKri)}
                            className="px-3 py-1 text-xs font-semibold rounded bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-xs"
                          >
                            Nhập số liệu
                          </button>
                        )}
                        {selectedKri.pendingSubmissions?.find((p) => p.canWithdraw) && (
                          <button
                            type="button"
                            onClick={() =>
                              setWithdrawPendingId(
                                selectedKri.pendingSubmissions!.find((p) => p.canWithdraw)!.id,
                              )
                            }
                            className="px-2.5 py-1 text-xs font-medium rounded border border-state-bad-line/40 text-state-bad-fg hover:bg-state-bad-bg transition"
                          >
                            Rút lại
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setTargetsDrawerIndicator(selectedKri)}
                            className="px-2.5 py-1 text-xs font-medium rounded border border-border text-text hover:bg-bg-tint transition"
                          >
                            Thiết lập
                          </button>
                        )}
                        {currentUser?.role !== 'viewer' && (
                          <button
                            type="button"
                            onClick={() => setHistoryIndicator(selectedKri)}
                            className="px-2.5 py-1 text-xs font-medium rounded border border-border text-text hover:bg-bg-tint transition"
                          >
                            Lịch sử nộp
                          </button>
                        )}
                        {selectedKri.pendingSubmissions && selectedKri.pendingSubmissions.length > 0 && (
                          <ApprovalBadge status="pending" />
                        )}
                      </div>
                    </div>

                    <div className="border-t border-border/60 pt-3">
                      <h4 className="text-xs font-semibold text-text mb-2">
                        Diễn biến các kỳ so với ngưỡng
                      </h4>
                      <IndicatorHistoryChart
                        indicatorId={selectedKri.id}
                        indicatorKind="kri"
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-text-muted">Chọn một KRI để xem chi tiết</p>
                )}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* 3. KHỐI CHỈ SỐ KIỂM SOÁT CHÍNH (KCI) */}
      <section id="kci" className="scroll-mt-28 print:break-before-page">
        <Card
          title="Chỉ số kiểm soát chính (KCI)"
          subtitle="Mức độ hiệu quả của các kiểm soát giảm thiểu rủi ro"
          action={
            isAdmin ? (
              <button
                type="button"
                data-testid="add-kci-button"
                onClick={() => {
                  const nextCode = getNextCode(`${profile.riskCode}.KCI`, kciIndicators.map((i) => i.code));
                  setIndicatorDrawer({
                    open: true,
                    kind: 'kci',
                    initialIndicator: null,
                    suggestedCode: nextCode,
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-control bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy transition"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Thêm KCI</span>
              </button>
            ) : undefined
          }
          badge={
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center text-state-ok-fg font-medium">
                <span className="w-2 h-2 rounded-full bg-state-ok-line mr-1" />
                {profile.kci.green}
              </span>
              <span className="inline-flex items-center text-state-warn-fg font-medium">
                <span className="w-2 h-2 rounded-full bg-state-warn-line mr-1" />
                {profile.kci.yellow}
              </span>
              <span className="inline-flex items-center text-state-bad-fg font-medium">
                <span className="w-2 h-2 rounded-full bg-state-bad-line mr-1" />
                {profile.kci.red}
              </span>
              {profile.kci.noData > 0 && (
                <span className="text-text-muted font-medium">
                  ({profile.kci.noData} chưa có số liệu)
                </span>
              )}
            </div>
          }
        >
          {kciIndicators.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-8 h-8 text-text-muted" aria-hidden="true" />}
              title="Chưa có chỉ số KCI"
              description="Hồ sơ này hiện chưa thiết lập chỉ số kiểm soát chính nào."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Kiểm soát / Chỉ số</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Đơn vị thực hiện</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Tần suất</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Thực tế so với mục tiêu</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Đánh giá</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Bản nộp</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {kciIndicators.map((kci) => {
                    const hasSubmit = Boolean(kci.submitPeriodKeys && kci.submitPeriodKeys.length > 0);
                    const withdrawable = kci.pendingSubmissions?.find((p) => p.canWithdraw);
                    const isViewer = currentUser?.role === 'viewer';

                    return (
                      <tr key={kci.id} className="hover:bg-bg-tint/40 transition-colors">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-text">{kci.name}</div>
                          <div className="font-mono text-[11px] text-text-muted mt-0.5">
                            {kci.code}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-text-muted">
                          {kci.ownerUnit ? kci.ownerUnit.name : 'Chưa gán'}
                        </td>
                        <td className="px-3 py-3 text-text-muted">{kci.frequency}</td>
                        <td className="px-3 py-3">
                          {kci.targetValue !== null && kci.targetValue !== undefined && kci.targetProgress !== null && kci.targetProgress !== undefined ? (
                            <div className="space-y-1 min-w-[140px] max-w-[200px]">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-text tabular-nums">
                                <span>{kci.targetProgress}% / 100%</span>
                              </div>
                              <div className="relative h-2 w-full rounded-full bg-border overflow-hidden">
                                <div
                                  data-testid="kci-target-progress-bar"
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    kci.current?.zone === 'green' && 'bg-state-ok-line',
                                    kci.current?.zone === 'yellow' && 'bg-state-warn-line',
                                    kci.current?.zone === 'red' && 'bg-state-bad-line',
                                    !kci.current?.zone && 'bg-brand-blue',
                                  )}
                                  style={{ width: `${Math.min(100, Math.max(0, kci.targetProgress))}%` }}
                                />
                                {kci.yellowAt !== null && kci.yellowAt !== undefined && (
                                  <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-slate-800/80 z-10"
                                    style={{ left: `${Math.min(100, Math.max(0, kci.yellowAt))}%` }}
                                    title={`Mức tối thiểu: ${formatNumber(kci.yellowAt)}`}
                                  />
                                )}
                              </div>
                              {kci.yellowAt !== null && kci.yellowAt !== undefined && (
                                <div className="text-[10px] text-text-muted truncate">
                                  Vạch dọc: mức tối thiểu {formatNumber(kci.yellowAt)}{kci.unitLabel === '%' ? '%' : kci.unitLabel ? ` ${kci.unitLabel}` : ''}
                                </div>
                              )}
                            </div>
                          ) : kci.current ? (
                            <div>
                              <span className="text-text-muted text-[11px] block">Chưa đặt mục tiêu</span>
                              <span className="font-semibold text-text tabular-nums">
                                {formatValueWithUnit(kci.current.valueText, kci.unitLabel)}
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-text-muted">—</span>
                              <span className="text-[11px] text-text-muted block">Chưa có số liệu</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <KciZoneBadge zone={kci.current ? kci.current.zone : null} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {kci.pendingSubmissions && kci.pendingSubmissions.length > 0 ? (
                            <ApprovalBadge status="pending" />
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {hasSubmit && (
                              <button
                                type="button"
                                onClick={() => setReadingFormIndicator(kci)}
                                className="px-2 py-0.5 text-xs font-semibold rounded bg-brand-blue text-white hover:bg-brand-blue/90 transition shadow-xs"
                              >
                                Nhập
                              </button>
                            )}
                            {withdrawable && (
                              <button
                                type="button"
                                onClick={() => setWithdrawPendingId(withdrawable.id)}
                                className="px-2 py-0.5 text-xs font-medium rounded border border-state-bad-line/40 text-state-bad-fg hover:bg-state-bad-bg transition"
                              >
                                Rút
                              </button>
                            )}
                            {!isViewer && (
                              <button
                                type="button"
                                onClick={() => setHistoryIndicator(kci)}
                                className="px-2 py-0.5 text-xs font-medium rounded border border-border text-text hover:bg-bg-tint transition"
                              >
                                Lịch sử
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                data-testid={`targets-kci-${kci.code}`}
                                onClick={() => setTargetsDrawerIndicator(kci)}
                                className="p-1 text-text-muted hover:text-brand-blue rounded"
                                title="Thiết lập ngưỡng và mục tiêu"
                              >
                                <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                data-testid={`edit-kci-${kci.code}`}
                                onClick={() => {
                                  setIndicatorDrawer({
                                    open: true,
                                    kind: 'kci',
                                    initialIndicator: {
                                      code: kci.code,
                                      kind: 'kci',
                                      name: kci.name,
                                      formula: kci.formula,
                                      frequency: kci.frequency,
                                      thresholds: kci.thresholds,
                                      note: kci.note,
                                    },
                                    suggestedCode: kci.code,
                                  });
                                }}
                                className="p-1 text-text-muted hover:text-brand-blue rounded"
                                title="Sửa KCI"
                              >
                                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                data-testid={`delete-kci-${kci.code}`}
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteConfirm({
                                    type: 'indicator',
                                    code: kci.code,
                                    name: `chỉ số KCI ${kci.code}`,
                                  });
                                }}
                                className="p-1 text-text-muted hover:text-state-bad-fg rounded"
                                title="Xóa KCI"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* 4. KHỐI KẾ HOẠCH HÀNH ĐỘNG */}
      <section id="actions" className="scroll-mt-28 print:break-before-page">
        <Card
          title="Kế hoạch hành động"
          subtitle="Các biện pháp giảm thiểu đưa rủi ro về mức chấp nhận được"
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/actions?profile=${encodeURIComponent(profile.riskCode)}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-brand-navy hover:underline"
              >
                <span>Mở trong bảng kế hoạch</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
              {canEdit && (
                <button
                  type="button"
                  data-testid="add-action-button"
                  onClick={() => {
                    const nextCode = getNextCode(`${profile.riskCode}.KH`, detail.actions.map((a) => a.code));
                    setActionDrawer({
                      open: true,
                      initialAction: null,
                      suggestedCode: nextCode,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-control bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy transition"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Thêm kế hoạch</span>
                </button>
              )}
            </div>
          }
        >
          {detail.actions.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-8 h-8 text-state-ok-line" aria-hidden="true" />}
              title="Chưa có kế hoạch hành động"
              description="Hiện chưa có kế hoạch hành động nào được lập cho hồ sơ này."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Hành động</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Đầu mối</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Thời hạn</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Tiến độ</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Liên kết</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Trạng thái</th>
                    {canEdit && (
                      <th scope="col" className="px-2 py-2.5 font-semibold text-right">Thao tác</th>
                    )}
                    <th scope="col" className="px-2 py-2.5 font-semibold text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {detail.actions.map((act) => {
                    const isExpanded = expandedActions[act.code];
                    const isSourceExpanded = expandedSourceText[act.code];
                    const unitName =
                      act.responsibilityText ||
                      act.tasks.map((t) => t.unit?.name).filter(Boolean).join(', ') ||
                      'Chưa gán';

                    return (
                      <React.Fragment key={act.code}>
                        <tr
                          onClick={() => toggleAction(act.code)}
                          className="hover:bg-bg-tint/40 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-3">
                            <div className="font-semibold text-text">{act.description}</div>
                            <div className="font-mono text-[11px] text-brand-navy mt-0.5">
                              {act.code}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-text-muted max-w-[150px] truncate" title={unitName}>
                            {unitName}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap tabular-nums text-text">
                            {formatDate(act.dueDate)}
                          </td>
                          <td className="px-3 py-3 min-w-[110px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <ProgressBar value={act.progress} showLabel={false} />
                              </div>
                              <span className="font-semibold text-[11px] tabular-nums text-text">
                                {formatPercent(act.progress)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {act.controlCodes.map((cc) => (
                                <a
                                  key={cc}
                                  href="#controls"
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-mono text-[10px] font-semibold text-brand-blue bg-bg-tint px-1.5 py-0.5 rounded border border-border hover:bg-brand-navy hover:text-white transition"
                                >
                                  {cc}
                                </a>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <StatusBadge status={act.status} />
                          </td>
                          {canEdit && (
                            <td className="px-2 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  data-testid={`edit-action-${act.code}`}
                                  onClick={() => {
                                    setActionDrawer({
                                      open: true,
                                      initialAction: {
                                        code: act.code,
                                        description: act.description,
                                        responsibilityText: act.responsibilityText || '',
                                        dueText: act.dueText || '',
                                      },
                                      suggestedCode: act.code,
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-brand-blue rounded"
                                  title="Sửa kế hoạch"
                                >
                                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`link-controls-${act.code}`}
                                  onClick={() => {
                                    setLinkCodesDialog({
                                      open: true,
                                      title: `Liên kết kiểm soát cho ${act.code}`,
                                      description: 'Chọn các biện pháp kiểm soát liên kết với kế hoạch hành động này.',
                                      currentLinkedCodes: act.controlCodes,
                                      availableItems: detail.controls.map((c) => ({
                                        code: c.code,
                                        text: c.description,
                                      })),
                                      onSave: async (codes: string[]) => {
                                        await apiSend(
                                          'PUT',
                                          `/api/profiles/${encodeURIComponent(profile.riskCode)}/actions/${encodeURIComponent(act.code)}/controls?cycle=${cycleParam}`,
                                          { codes },
                                        );
                                        router.refresh();
                                      },
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-brand-navy rounded"
                                  title="Liên kết kiểm soát"
                                >
                                  <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`delete-action-${act.code}`}
                                  onClick={() => {
                                    setDeleteError(null);
                                    setDeleteConfirm({
                                      type: 'action',
                                      code: act.code,
                                      name: `kế hoạch hành động ${act.code}`,
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-state-bad-fg rounded"
                                  title="Xóa kế hoạch"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          )}
                          <td className="px-2 py-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAction(act.code);
                              }}
                              className="p-1 text-text-muted hover:text-text rounded"
                              aria-label={isExpanded ? 'Thu gọn đầu việc' : 'Mở rộng đầu việc'}
                            >
                              <ChevronDown
                                className={cn(
                                  'w-4 h-4 transition-transform',
                                  isExpanded && 'rotate-180',
                                )}
                              />
                            </button>
                          </td>
                        </tr>

                        {/* Hàng mở rộng: Đầu việc và Văn bản gốc */}
                        {isExpanded && (
                          <tr className="bg-bg-tint/25">
                            <td colSpan={canEdit ? 8 : 7} className="px-4 py-4 space-y-3">
                              {/* Bảng đầu việc */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-semibold text-text">
                                    Đầu việc chi tiết ({act.tasks.length})
                                  </h4>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      data-testid={`add-task-${act.code}`}
                                      onClick={() => {
                                        setTaskDialog({
                                          open: true,
                                          actionCode: act.code,
                                          initialTask: null,
                                        });
                                      }}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-blue hover:text-brand-navy"
                                    >
                                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>Thêm đầu việc</span>
                                    </button>
                                  )}
                                </div>
                                {act.tasks.length === 0 ? (
                                  <p className="text-xs text-text-muted">Chưa có đầu việc phân rã</p>
                                ) : (
                                  <div className="overflow-x-auto rounded border border-border bg-surface">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                                        <tr>
                                          <th scope="col" className="px-3 py-2 font-semibold">Tên đầu việc</th>
                                          <th scope="col" className="px-3 py-2 font-semibold">Đơn vị</th>
                                          <th scope="col" className="px-3 py-2 font-semibold">Hạn</th>
                                          <th scope="col" className="px-3 py-2 font-semibold">Tỷ trọng</th>
                                          <th scope="col" className="px-3 py-2 font-semibold">Tiến độ</th>
                                          <th scope="col" className="px-3 py-2 font-semibold">Cập nhật</th>
                                          <th scope="col" className="px-3 py-2 font-semibold">Bản nộp</th>
                                          <th scope="col" className="px-3 py-2 font-semibold text-right">Thao tác</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/60">
                                        {act.tasks.map((t) => {
                                          const isViewer = currentUser?.role === 'viewer';
                                          const hasPending = t.pendingSubmissions && t.pendingSubmissions.length > 0;
                                          const pendingWithdrawItem = t.pendingSubmissions?.find((s) => s.canWithdraw);
                                          const canUpdate = t.submitPeriodKeys && t.submitPeriodKeys.length > 0;

                                          return (
                                            <tr key={t.id}>
                                              <td className="px-3 py-2 font-medium text-text">{t.name}</td>
                                              <td className="px-3 py-2 text-text-muted">
                                                {t.unit ? t.unit.name : 'Chưa gán'}
                                              </td>
                                              <td className="px-3 py-2 tabular-nums text-text">
                                                {formatDate(t.dueDate)}
                                              </td>
                                              <td className="px-3 py-2 tabular-nums text-text-muted">
                                                {t.weight}%
                                              </td>
                                              <td className="px-3 py-2 tabular-nums font-semibold text-text">
                                                {formatPercent(t.progress)}
                                              </td>
                                              <td className="px-3 py-2 tabular-nums text-text-muted text-[11px]">
                                                {t.lastApprovedUpdateAt
                                                  ? formatDate(t.lastApprovedUpdateAt)
                                                  : '—'}
                                              </td>
                                              <td className="px-3 py-2">
                                                {hasPending ? (
                                                  <ApprovalBadge status="pending" />
                                                ) : (
                                                  <span className="text-text-muted">—</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                  {canUpdate && (
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setUpdateFormTask({
                                                          ...t,
                                                          actionCode: act.code,
                                                        })
                                                      }
                                                      className="px-2 py-1 text-xs font-semibold rounded bg-brand-blue text-white hover:bg-brand-blue-bright transition shadow-subtle"
                                                    >
                                                      Cập nhật
                                                    </button>
                                                  )}
                                                  {pendingWithdrawItem && (
                                                    <button
                                                      type="button"
                                                      onClick={() => setWithdrawTaskPendingId(pendingWithdrawItem.id)}
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
                                                          id: t.id,
                                                          name: t.name,
                                                          actionCode: act.code,
                                                          pendingSubmissions: t.pendingSubmissions,
                                                        })
                                                      }
                                                      className="px-2 py-1 text-xs font-medium rounded border border-border text-text hover:bg-bg-tint transition"
                                                    >
                                                      Lịch sử
                                                    </button>
                                                  )}
                                                  {canEdit && (
                                                    <>
                                                      <button
                                                        type="button"
                                                        data-testid={`edit-task-${t.id}`}
                                                        onClick={() => {
                                                          setTaskDialog({
                                                            open: true,
                                                            actionCode: act.code,
                                                            initialTask: {
                                                              id: t.id,
                                                              name: t.name,
                                                              unitCode: t.unit ? t.unit.code : null,
                                                              dueDate: t.dueDate,
                                                            },
                                                          });
                                                        }}
                                                        className="p-1 text-text-muted hover:text-brand-blue rounded"
                                                        title="Sửa đầu việc"
                                                      >
                                                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        data-testid={`split-task-${t.id}`}
                                                        onClick={() => {
                                                          setSplitTaskDialog({
                                                            open: true,
                                                            task: {
                                                              id: t.id,
                                                              name: t.name,
                                                              sourceText: t.sourceText,
                                                              unit: t.unit,
                                                              dueDate: t.dueDate,
                                                            },
                                                          });
                                                        }}
                                                        className="p-1 text-text-muted hover:text-brand-navy rounded"
                                                        title="Tách đầu việc"
                                                      >
                                                        <Split className="w-3.5 h-3.5" aria-hidden="true" />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        data-testid={`delete-task-${t.id}`}
                                                        onClick={() => {
                                                          setDeleteError(null);
                                                          setDeleteConfirm({
                                                            type: 'task',
                                                            code: t.id,
                                                            name: `đầu việc "${t.name}"`,
                                                          });
                                                        }}
                                                        className="p-1 text-text-muted hover:text-state-bad-fg rounded"
                                                        title="Xóa đầu việc"
                                                      >
                                                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                                      </button>
                                                    </>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Nút xem Văn bản gốc trong Excel */}
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => toggleSourceText(act.code)}
                                  className="text-xs font-semibold text-brand-blue hover:underline inline-flex items-center gap-1"
                                >
                                  <span>Văn bản gốc trong Excel</span>
                                  <ChevronRight
                                    className={cn(
                                      'w-3.5 h-3.5 transition-transform',
                                      isSourceExpanded && 'rotate-90',
                                    )}
                                  />
                                </button>
                                {isSourceExpanded && (
                                  <div className="mt-2 rounded border border-border bg-surface p-3 text-xs text-text space-y-1.5">
                                    <div className="whitespace-pre-line leading-relaxed text-text-muted">
                                      {act.tasks.find((t) => t.sourceText)?.sourceText ||
                                        'Không có ghi chú văn bản gốc'}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* VÙNG CHI TIẾT THEO BIỂU MẪU BM06 */}
      <section id="bm06" className="scroll-mt-28 print:break-before-page">
        <div className="rounded-card border border-border/80 bg-surface shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setIsBm06Expanded(!isBm06Expanded)}
            aria-expanded={showBm06}
            className="w-full flex items-center justify-between p-4 bg-bg-tint/40 hover:bg-bg-tint/70 transition text-left cursor-pointer print:hidden"
          >
            <div className="flex items-center gap-2">
              <ChevronDown
                className={cn('w-4 h-4 text-text-muted transition-transform', showBm06 && 'rotate-180')}
              />
              <h2 className="text-sm font-bold text-text">
                Chi tiết theo biểu mẫu BM06
              </h2>
              <span className="text-xs text-text-muted font-normal">
                (Kiểm soát, Nguyên nhân & ảnh hưởng, Thông tin chung)
              </span>
            </div>
            <span className="text-xs font-medium text-brand-blue">
              {showBm06 ? 'Thu gọn' : 'Mở rộng'}
            </span>
          </button>

          {showBm06 && (
            <div className="p-4 sm:p-6 space-y-6 border-t border-border/80">
              {/* 5. KHỐI KIỂM SOÁT HIỆN TẠI (BM06) */}
              <section id="controls" className="scroll-mt-28 print:break-before-page">
        <Card
          title="Kiểm soát hiện tại (BM06)"
          subtitle="Các biện pháp và quy trình kiểm soát đang áp dụng theo biểu mẫu BM06"
          action={
            canEdit ? (
              <button
                type="button"
                data-testid="add-control-button"
                onClick={() => {
                  const nextCode = getNextCode(`${profile.riskCode}.KS`, detail.controls.map((c) => c.code));
                  setControlDrawer({
                    open: true,
                    initialControl: null,
                    suggestedCode: nextCode,
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-control bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy transition"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Thêm kiểm soát</span>
              </button>
            ) : undefined
          }
        >
          {detail.controls.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-8 h-8 text-text-muted" aria-hidden="true" />}
              title="Chưa có biện pháp kiểm soát"
              description="Hồ sơ này hiện chưa khai báo kiểm soát nào trong biểu mẫu BM06."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Mã KS</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Mô tả kiểm soát</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Chủ kiểm soát & Đơn vị</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Tần suất</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Mục tiêu</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Cách thức</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Đánh giá hiệu quả</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Bổ sung</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Liên kết</th>
                    {canEdit && (
                      <th scope="col" className="px-2 py-2.5 font-semibold text-right">Thao tác</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {detail.controls.map((ctrl) => {
                    const assignedUnits = ctrl.units.map((u) => u.name).join(', ');
                    return (
                      <tr key={ctrl.code} className="hover:bg-bg-tint/40 transition-colors">
                        <td className="px-3 py-3 font-mono font-bold text-brand-navy whitespace-nowrap">
                          {ctrl.code}
                        </td>
                        <td className="px-3 py-3 text-text font-medium min-w-[200px]">
                          {ctrl.description}
                        </td>
                        <td className="px-3 py-3 text-text-muted text-[11px] min-w-[140px]">
                          <div>{ctrl.ownerText}</div>
                          {assignedUnits && (
                            <div className="text-text font-medium mt-0.5">({assignedUnits})</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-text-muted whitespace-nowrap">
                          {ctrl.frequency}
                        </td>
                        <td className="px-3 py-3 text-text-muted whitespace-nowrap">
                          {ctrl.objective}
                        </td>
                        <td className="px-3 py-3 text-text-muted whitespace-nowrap">
                          {ctrl.method}
                        </td>
                        <td className="px-3 py-3 text-[11px] whitespace-nowrap space-y-0.5">
                          <div>Thiết kế: <strong className="text-text">{ctrl.designEff}</strong></div>
                          <div>Vận hành: <strong className="text-text">{ctrl.operatingEff}</strong></div>
                          <div>Tổng thể: <strong className="text-text">{ctrl.overallEff}</strong></div>
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          {ctrl.needsSupplement ? (
                            <span className="rounded bg-state-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-state-warn-fg">
                              Có
                            </span>
                          ) : (
                            <span className="text-text-muted text-[11px]">Không</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="space-y-1">
                            {ctrl.actionCodes.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {ctrl.actionCodes.map((ac) => (
                                  <a
                                    key={ac}
                                    href="#actions"
                                    className="font-mono text-[10px] text-brand-blue hover:underline"
                                  >
                                    {ac}
                                  </a>
                                ))}
                              </div>
                            )}
                            {ctrl.causeCodes.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {ctrl.causeCodes.map((cc) => (
                                  <a
                                    key={cc}
                                    href="#causes-impacts"
                                    className="font-mono text-[10px] text-text-muted hover:underline"
                                  >
                                    {cc}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        {canEdit && (
                          <td className="px-2 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                data-testid={`edit-control-${ctrl.code}`}
                                onClick={() => {
                                  setControlDrawer({
                                    open: true,
                                    initialControl: {
                                      code: ctrl.code,
                                      description: ctrl.description,
                                      ownerText: ctrl.ownerText,
                                      frequency: ctrl.frequency,
                                      objective: ctrl.objective,
                                      method: ctrl.method,
                                      designEff: ctrl.designEff,
                                      operatingEff: ctrl.operatingEff,
                                      overallEff: ctrl.overallEff,
                                      needsSupplement: ctrl.needsSupplement,
                                    },
                                    suggestedCode: ctrl.code,
                                  });
                                }}
                                className="p-1 text-text-muted hover:text-brand-blue rounded"
                                title="Sửa kiểm soát"
                              >
                                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                data-testid={`link-causes-${ctrl.code}`}
                                onClick={() => {
                                  setLinkCodesDialog({
                                    open: true,
                                    title: `Liên kết nguyên nhân cho ${ctrl.code}`,
                                    description: 'Chọn các nguyên nhân rủi ro liên kết với biện pháp kiểm soát này.',
                                    currentLinkedCodes: ctrl.causeCodes,
                                    availableItems: detail.causes.map((c) => ({
                                      code: c.code,
                                      text: `${c.group}: ${c.description}`,
                                    })),
                                    onSave: async (codes: string[]) => {
                                      await apiSend(
                                        'PUT',
                                        `/api/profiles/${encodeURIComponent(profile.riskCode)}/controls/${encodeURIComponent(ctrl.code)}/causes?cycle=${cycleParam}`,
                                        { codes },
                                      );
                                      router.refresh();
                                    },
                                  });
                                }}
                                className="p-1 text-text-muted hover:text-brand-navy rounded"
                                title="Liên kết nguyên nhân"
                              >
                                <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                data-testid={`delete-control-${ctrl.code}`}
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteConfirm({
                                    type: 'control',
                                    code: ctrl.code,
                                    name: `biện pháp kiểm soát ${ctrl.code}`,
                                  });
                                }}
                                className="p-1 text-text-muted hover:text-state-bad-fg rounded"
                                title="Xóa kiểm soát"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* 6. KHỐI NGUYÊN NHÂN VÀ ẢNH HƯỞNG */}
      <section id="causes-impacts" className="scroll-mt-28 print:break-before-page">
        <Card
          title="Nguyên nhân và ảnh hưởng"
          subtitle="Chi tiết các yếu tố dẫn đến rủi ro và các tác động tiềm ẩn"
        >
          <div className="space-y-6">
            {/* Bảng Nguyên nhân rủi ro */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text">
                  1. Nguyên nhân rủi ro ({detail.causes.length})
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    data-testid="add-cause-button"
                    onClick={() => {
                      const nextCode = getNextCode(`${profile.riskCode}.NN`, detail.causes.map((c) => c.code));
                      setCauseDrawer({
                        open: true,
                        initialCause: null,
                        suggestedCode: nextCode,
                      });
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-brand-navy"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Thêm nguyên nhân</span>
                  </button>
                )}
              </div>
              {detail.causes.length === 0 ? (
                <p className="text-xs text-text-muted">Chưa có dữ liệu nguyên nhân</p>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">Mã</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Nhóm nguyên nhân</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Mô tả chi tiết</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Kiểm soát liên quan</th>
                        {canEdit && (
                          <th scope="col" className="px-2 py-2 font-semibold text-right">Thao tác</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {detail.causes.map((c) => (
                        <tr key={c.code} className="hover:bg-bg-tint/30 transition-colors">
                          <td className="px-3 py-2.5 font-mono font-bold text-brand-navy whitespace-nowrap">
                            {c.code}
                          </td>
                          <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">
                            {c.group}
                          </td>
                          <td className="px-3 py-2.5 text-text font-medium">{c.description}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {c.controlCodes.map((cc) => (
                                <a
                                  key={cc}
                                  href="#controls"
                                  className="font-mono text-[10px] text-brand-blue bg-bg-tint px-1.5 py-0.5 rounded border border-border hover:underline"
                                >
                                  {cc}
                                </a>
                              ))}
                            </div>
                          </td>
                          {canEdit && (
                            <td className="px-2 py-2.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  data-testid={`edit-cause-${c.code}`}
                                  onClick={() => {
                                    setCauseDrawer({
                                      open: true,
                                      initialCause: {
                                        code: c.code,
                                        group: c.group,
                                        description: c.description,
                                      },
                                      suggestedCode: c.code,
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-brand-blue rounded"
                                  title="Sửa nguyên nhân"
                                >
                                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`delete-cause-${c.code}`}
                                  onClick={() => {
                                    setDeleteError(null);
                                    setDeleteConfirm({
                                      type: 'cause',
                                      code: c.code,
                                      name: `nguyên nhân ${c.code}`,
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-state-bad-fg rounded"
                                  title="Xóa nguyên nhân"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Bảng Ảnh hưởng tiềm ẩn */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text">
                  2. Ảnh hưởng tiềm ẩn ({detail.impacts.length})
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    data-testid="add-impact-button"
                    onClick={() => {
                      const nextCode = getNextCode(`${profile.riskCode}.AH`, detail.impacts.map((i) => i.code));
                      setImpactDrawer({
                        open: true,
                        initialImpact: null,
                        suggestedCode: nextCode,
                      });
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:text-brand-navy"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Thêm ảnh hưởng</span>
                  </button>
                )}
              </div>
              {detail.impacts.length === 0 ? (
                <p className="text-xs text-text-muted">Chưa có dữ liệu ảnh hưởng</p>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">Mã</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Nhóm ảnh hưởng</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Mô tả ảnh hưởng</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Mức độ</th>
                        {canEdit && (
                          <th scope="col" className="px-2 py-2 font-semibold text-right">Thao tác</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {detail.impacts.map((i) => (
                        <tr key={i.code} className="hover:bg-bg-tint/30 transition-colors">
                          <td className="px-3 py-2.5 font-mono font-bold text-brand-navy whitespace-nowrap">
                            {i.code}
                          </td>
                          <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">
                            {i.group}
                          </td>
                          <td className="px-3 py-2.5 text-text font-medium">{i.description}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className="font-semibold text-text">{i.level}</span>
                          </td>
                          {canEdit && (
                            <td className="px-2 py-2.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  data-testid={`edit-impact-${i.code}`}
                                  onClick={() => {
                                    setImpactDrawer({
                                      open: true,
                                      initialImpact: {
                                        code: i.code,
                                        group: i.group,
                                        description: i.description,
                                        level: i.level,
                                      },
                                      suggestedCode: i.code,
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-brand-blue rounded"
                                  title="Sửa ảnh hưởng"
                                >
                                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`delete-impact-${i.code}`}
                                  onClick={() => {
                                    setDeleteError(null);
                                    setDeleteConfirm({
                                      type: 'impact',
                                      code: i.code,
                                      name: `ảnh hưởng ${i.code}`,
                                    });
                                  }}
                                  className="p-1 text-text-muted hover:text-state-bad-fg rounded"
                                  title="Xóa ảnh hưởng"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* 7. KHỐI THÔNG TIN CHUNG */}
      <section id="general" className="scroll-mt-28 print:break-before-page">
        <Card
          title="Thông tin chung"
          subtitle="Thuộc tính hồ sơ, mô tả chi tiết và lịch sử đánh giá mức còn lại"
        >
          <div className="space-y-6">
            {/* Lưới các thuộc tính */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-lg border border-border bg-bg-tint/30">
                <span className="text-text-muted block text-[11px]">Mã hồ sơ</span>
                <span className="font-mono font-semibold text-text mt-0.5 block">
                  {profile.hsrrCode}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-bg-tint/30">
                <span className="text-text-muted block text-[11px]">Mã rủi ro</span>
                <span className="font-mono font-semibold text-brand-navy mt-0.5 block">
                  {profile.riskCode}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-bg-tint/30">
                <span className="text-text-muted block text-[11px]">Loại rủi ro</span>
                <span className="font-medium text-text mt-0.5 block">{profile.riskType}</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-bg-tint/30">
                <span className="text-text-muted block text-[11px]">Vùng rủi ro</span>
                <span className="font-medium text-text mt-0.5 block">{profile.riskZone}</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-bg-tint/30">
                <span className="text-text-muted block text-[11px]">Nhóm rủi ro</span>
                <span className="font-medium text-text mt-0.5 block">{profile.riskGroup}</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-bg-tint/30">
                <span className="text-text-muted block text-[11px]">Chủ rủi ro</span>
                <span className="font-semibold text-text mt-0.5 block">{profile.owner}</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-bg-tint/30">
                <span className="text-text-muted block text-[11px]">Hoạt động liên quan</span>
                <span className="font-medium text-text mt-0.5 block">
                  {detail.relatedActivity || '—'}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-bg-tint/30">
                <span className="text-text-muted block text-[11px]">Đơn vị lập</span>
                <span className="font-medium text-text mt-0.5 block">
                  {detail.preparedByUnit || '—'}
                </span>
              </div>
            </div>

            {/* Mô tả chi tiết rủi ro (giữ nguyên xuống dòng và gạch đầu dòng) */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
                Mô tả chi tiết rủi ro
              </h3>
              <div className="p-4 rounded-lg bg-bg-tint/40 border border-border whitespace-pre-line text-sm text-text leading-relaxed">
                {detail.description || 'Chưa có mô tả chi tiết'}
              </div>
            </div>

            {/* Bảng Lịch sử đánh giá mức rủi ro còn lại theo kỳ */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
                Lịch sử đánh giá mức rủi ro còn lại theo kỳ
              </h3>
              {residualHistoryList && residualHistoryList.length > 0 ? (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-bg-tint text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">Kỳ báo cáo</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Khả năng</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Mức tác động</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Mức rủi ro còn lại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {residualHistoryList.map((res) => (
                        <tr key={res.periodKey} className="hover:bg-bg-tint/30 transition-colors">
                          <td className="px-3 py-2.5 font-semibold text-brand-navy">
                            {res.periodKey}
                          </td>
                          <td className="px-3 py-2.5 text-text tabular-nums">
                            {res.rating.likelihoodLabel} (Điểm: {res.rating.likelihoodScore})
                          </td>
                          <td className="px-3 py-2.5 text-text tabular-nums">
                            {res.rating.impactLabel} (Điểm: {res.rating.impactScore})
                          </td>
                          <td className="px-3 py-2.5">
                            <Pill levelLabel={res.rating.levelLabel} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-text-muted">Chưa có lịch sử đánh giá các kỳ</p>
              )}
            </div>
          </div>
        </Card>
      </section>
            </div>
          )}
        </div>
      </section>

      {/* IndicatorTargetsDrawer (Plan 4C) */}
      {targetsDrawerIndicator && (
        <IndicatorTargetsDrawer
          open={!!targetsDrawerIndicator}
          onOpenChange={(open) => !open && setTargetsDrawerIndicator(null)}
          riskCode={profile.riskCode}
          indicator={targetsDrawerIndicator}
          cycle={activeCycleYear}
          onSuccess={() => {
            setTargetsDrawerIndicator(null);
            router.refresh();
          }}
        />
      )}

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

      {/* ConfirmDialog for quick reading withdraw */}
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

      {/* ConfirmDialog for quick task withdraw */}
      <ConfirmDialog
        open={!!withdrawTaskPendingId}
        onOpenChange={(open) => !open && setWithdrawTaskPendingId(null)}
        title="Xác nhận rút lại bản nộp tiến độ"
        description="Bạn có chắc chắn muốn rút lại bản nộp tiến độ đang chờ duyệt này không? Bản nộp sẽ chuyển sang trạng thái đã rút và không thể khôi phục."
        confirmText="Rút lại"
        variant="danger"
        isSubmitting={isWithdrawingTask}
        onConfirm={async () => {
          if (!withdrawTaskPendingId) return;
          setIsWithdrawingTask(true);
          try {
            await apiSend('POST', `/api/task-updates/${withdrawTaskPendingId}/withdraw`);
            setWithdrawTaskPendingId(null);
            router.refresh();
          } catch (err: unknown) {
            if (err instanceof ApiClientError) {
              alert(err.message);
            }
          } finally {
            setIsWithdrawingTask(false);
          }
        }}
      />

      {/* ResidualAssessmentDialog */}
      <ResidualAssessmentDialog
        riskCode={profile.riskCode}
        cycleYear={activeCycleYear}
        residualHistory={residualHistoryList}
        open={residualDialogOpen}
        onClose={() => setResidualDialogOpen(false)}
        onSuccess={(savedEntry) => {
          setCurrentResidual(savedEntry.rating);
          setResidualHistoryList((prev) => {
            const idx = prev.findIndex((r) => r.periodKey === savedEntry.periodKey);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = savedEntry;
              return next;
            }
            return [...prev, savedEntry];
          });
          router.refresh();
        }}
      />

      {/* DRAWERS & DIALOGS (Plan 4A) */}
      {isEditProfileOpen && (
        <ProfileFormDrawer
          open={isEditProfileOpen}
          onOpenChange={setIsEditProfileOpen}
          heatmap={heatmap}
          cycle={activeCycleYear}
          initialProfile={{
            riskCode: profile.riskCode,
            name: profile.name,
            hsrrCode: profile.hsrrCode,
            riskType: profile.riskType,
            riskZone: profile.riskZone,
            riskGroup: profile.riskGroup,
            owner: profile.owner,
            relatedActivity: detail.relatedActivity,
            preparedByUnit: detail.preparedByUnit,
            description: detail.description,
            inherent: {
              impactLabel: profile.inherent.impactLabel,
              likelihoodLabel: profile.inherent.likelihoodLabel,
              levelLabel: profile.inherent.levelLabel,
            },
          }}
          onSuccess={async () => {
            router.refresh();
          }}
        />
      )}

      {causeDrawer.open && (
        <CauseFormDrawer
          open={causeDrawer.open}
          onOpenChange={(open) => setCauseDrawer((prev) => ({ ...prev, open }))}
          riskCode={profile.riskCode}
          initialCause={causeDrawer.initialCause}
          suggestedCode={causeDrawer.suggestedCode}
          cycle={activeCycleYear}
          onSuccess={async () => {
            router.refresh();
          }}
        />
      )}

      {impactDrawer.open && (
        <ImpactFormDrawer
          open={impactDrawer.open}
          onOpenChange={(open) => setImpactDrawer((prev) => ({ ...prev, open }))}
          riskCode={profile.riskCode}
          impactLevels={heatmap?.impactLevels}
          initialImpact={impactDrawer.initialImpact}
          suggestedCode={impactDrawer.suggestedCode}
          cycle={activeCycleYear}
          onSuccess={async () => {
            router.refresh();
          }}
        />
      )}

      {controlDrawer.open && (
        <ControlFormDrawer
          open={controlDrawer.open}
          onOpenChange={(open) => setControlDrawer((prev) => ({ ...prev, open }))}
          riskCode={profile.riskCode}
          initialControl={controlDrawer.initialControl}
          suggestedCode={controlDrawer.suggestedCode}
          cycle={activeCycleYear}
          onSuccess={async () => {
            router.refresh();
          }}
        />
      )}

      {actionDrawer.open && (
        <ActionFormDrawer
          open={actionDrawer.open}
          onOpenChange={(open) => setActionDrawer((prev) => ({ ...prev, open }))}
          riskCode={profile.riskCode}
          initialAction={actionDrawer.initialAction}
          suggestedCode={actionDrawer.suggestedCode}
          cycle={activeCycleYear}
          onSuccess={async () => {
            router.refresh();
          }}
        />
      )}

      {indicatorDrawer.open && (
        <IndicatorFormDrawer
          open={indicatorDrawer.open}
          onOpenChange={(open) => setIndicatorDrawer((prev) => ({ ...prev, open }))}
          riskCode={profile.riskCode}
          kind={indicatorDrawer.kind}
          initialIndicator={indicatorDrawer.initialIndicator}
          suggestedCode={indicatorDrawer.suggestedCode}
          cycle={activeCycleYear}
          onSuccess={async () => {
            router.refresh();
          }}
        />
      )}

      {linkCodesDialog && (
        <LinkCodesDialog
          open={linkCodesDialog.open}
          onOpenChange={(open) => {
            if (!open) setLinkCodesDialog(null);
          }}
          title={linkCodesDialog.title}
          description={linkCodesDialog.description}
          availableItems={linkCodesDialog.availableItems}
          currentLinkedCodes={linkCodesDialog.currentLinkedCodes}
          onSave={linkCodesDialog.onSave}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          open={Boolean(deleteConfirm)}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteConfirm(null);
              setDeleteError(null);
            }
          }}
          title={`Xác nhận xóa ${deleteConfirm.name || deleteConfirm.code}`}
          description={
            deleteConfirm.type === 'profile'
              ? `Bạn có chắc chắn muốn xóa toàn bộ hồ sơ rủi ro ${profile.riskCode} (${profile.name})? Thao tác này không thể hoàn tác.`
              : `Bạn có chắc chắn muốn xóa ${deleteConfirm.name || deleteConfirm.code}?`
          }
          confirmLabel="Xóa"
          isDestructive={true}
          isLoading={isDeleting}
          onConfirm={executeDelete}
        >
          {deleteError && (
            <div className="mt-3">
              <ReferencedAlert error={deleteError} />
            </div>
          )}
        </ConfirmDialog>
      )}

      {taskDialog.open && (
        <TaskFormDialog
          open={taskDialog.open}
          onOpenChange={(open) => setTaskDialog((prev) => ({ ...prev, open }))}
          riskCode={profile.riskCode}
          actionCode={taskDialog.actionCode}
          units={units}
          initialTask={taskDialog.initialTask}
          cycle={activeCycleYear}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}

      {splitTaskDialog && (
        <TaskSplitDialog
          open={splitTaskDialog.open}
          onOpenChange={(open) => {
            if (!open) setSplitTaskDialog(null);
          }}
          task={splitTaskDialog.task}
          units={units}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
