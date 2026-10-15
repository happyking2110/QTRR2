'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Upload,
  Copy,
  Archive,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import type { components } from '@/lib/api/schema';
import { apiSend, ApiClientError } from '@/lib/api/client';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ImportCycleDialog } from './ImportCycleDialog';
import { CloneCycleDialog } from './CloneCycleDialog';

type CycleSummary = components['schemas']['CycleSummary'];

export interface CyclesViewProps {
  cycles: CycleSummary[];
}

export function CyclesView({ cycles }: CyclesViewProps) {
  const router = useRouter();

  const [importOpen, setImportOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSourceYear, setCloneSourceYear] = useState<number | undefined>(undefined);

  // Archive state
  const [archiveTarget, setArchiveTarget] = useState<CycleSummary | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<{
    code: string;
    message: string;
    showApprovalsLink: boolean;
  } | null>(null);

  const handleOpenClone = (year?: number) => {
    setCloneSourceYear(year);
    setCloneOpen(true);
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;

    setIsArchiving(true);
    setArchiveError(null);

    try {
      await apiSend('POST', `/api/cycles/${archiveTarget.year}/archive`);
      setArchiveTarget(null);
      router.refresh();
    } catch (err: unknown) {
      setArchiveTarget(null);
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409 && (err.code === 'INVALID_STATE' || err.code === 'CONFLICT')) {
          setArchiveError({
            code: err.code,
            message:
              err.message ||
              `Không thể lưu trữ chu kỳ ${archiveTarget.year}: Còn bản ghi đang chờ duyệt trong chu kỳ này.`,
            showApprovalsLink: true,
          });
        } else {
          setArchiveError({
            code: err.code,
            message: err.message || `Lỗi khi lưu trữ chu kỳ ${archiveTarget.year}.`,
            showApprovalsLink: false,
          });
        }
      } else {
        setArchiveError({
          code: 'ERROR',
          message: (err as Error)?.message || `Lỗi không xác định khi lưu trữ chu kỳ.`,
          showApprovalsLink: false,
        });
      }
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề trang và nút thao tác */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Quản trị hệ thống
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-text mt-0.5">
            Quản lý chu kỳ đánh giá
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Danh sách chu kỳ quản lý rủi ro trọng yếu, hỗ trợ import từ Excel, nhân bản và lưu trữ.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenClone()}
            className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg-tint transition-colors shadow-sm"
          >
            <Copy className="w-3.5 h-3.5 text-brand-blue" aria-hidden="true" />
            <span>Nhân bản</span>
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-control bg-brand-blue px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-navy transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Import chu kỳ</span>
          </button>
        </div>
      </div>

      {/* Thông báo lỗi khi lưu trữ chu kỳ */}
      {archiveError && (
        <div
          role="alert"
          className="rounded-card border border-state-bad-line/50 bg-state-bad-bg p-4 text-xs text-state-bad-fg space-y-2"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 space-y-1">
              <p className="font-bold text-sm">Không thể lưu trữ chu kỳ</p>
              <p>{archiveError.message}</p>
              {archiveError.showApprovalsLink && (
                <div className="pt-1.5">
                  <Link
                    href="/approvals"
                    className="inline-flex items-center gap-1.5 font-bold text-brand-blue hover:underline bg-surface px-2.5 py-1 rounded border border-border"
                  >
                    <span>Đi đến trang Chờ duyệt để xử lý bản nộp</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setArchiveError(null)}
              className="text-text-muted hover:text-text text-xs p-1"
              aria-label="Đóng thông báo"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Danh sách chu kỳ dạng thẻ trên mobile (<640px) */}
      <div className="sm:hidden space-y-3" data-testid="cycles-mobile-cards">
        {cycles.length === 0 ? (
          <div className="rounded-card border border-border bg-surface p-6 text-center text-xs text-text-muted">
            Chưa có chu kỳ nào trong hệ thống. Hãy bắt đầu bằng cách import tệp Excel.
          </div>
        ) : (
          cycles.map((cycle) => {
            const isOpen = cycle.status === 'open';

            return (
              <div
                key={cycle.year}
                className="rounded-card border border-border bg-surface p-4 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-text">
                    <Calendar className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                    <span>Chu kỳ {cycle.year}</span>
                  </div>
                  {isOpen ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-state-ok-bg px-2.5 py-0.5 text-[11px] font-semibold text-state-ok-fg border border-state-ok-line/40">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                      Đang mở
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-tint px-2.5 py-0.5 text-[11px] font-medium text-text-muted border border-border">
                      <Archive className="w-3 h-3" aria-hidden="true" />
                      Đã lưu trữ
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => handleOpenClone(cycle.year)}
                    className="inline-flex items-center gap-1 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text hover:bg-bg-tint hover:text-brand-blue transition-colors"
                    title={`Nhân bản từ chu kỳ ${cycle.year}`}
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Nhân bản</span>
                  </button>
                  {isOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setArchiveError(null);
                        setArchiveTarget(cycle);
                      }}
                      className="inline-flex items-center gap-1 rounded-control border border-state-warn-line/50 bg-state-warn-bg/20 px-2.5 py-1.5 text-xs font-medium text-state-warn-fg hover:bg-state-warn-bg/50 transition-colors"
                      title={`Lưu trữ chu kỳ ${cycle.year}`}
                    >
                      <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Lưu trữ</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-text-muted italic px-2 py-1">
                      Chỉ đọc
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bảng danh sách chu kỳ trên máy tính (>=640px) */}
      <div className="hidden sm:block rounded-card border border-border bg-surface overflow-hidden shadow-sm" data-testid="cycles-desktop-table">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-bg-tint/70 text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Năm chu kỳ
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {cycles.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-text-muted">
                    Chưa có chu kỳ nào trong hệ thống. Hãy bắt đầu bằng cách import tệp Excel.
                  </td>
                </tr>
              ) : (
                cycles.map((cycle) => {
                  const isOpen = cycle.status === 'open';

                  return (
                    <tr key={cycle.year} className="hover:bg-bg-tint/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-sm text-text">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                          <span>Chu kỳ {cycle.year}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isOpen ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-state-ok-bg px-2.5 py-0.5 text-[11px] font-semibold text-state-ok-fg border border-state-ok-line/40">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            Đang mở
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-tint px-2.5 py-0.5 text-[11px] font-medium text-text-muted border border-border">
                            <Archive className="w-3 h-3" aria-hidden="true" />
                            Đã lưu trữ
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => handleOpenClone(cycle.year)}
                            className="inline-flex items-center gap-1 rounded-control border border-border bg-surface px-2.5 py-1 font-medium text-text hover:bg-bg-tint hover:text-brand-blue transition-colors"
                            title={`Nhân bản từ chu kỳ ${cycle.year}`}
                          >
                            <Copy className="w-3 h-3" aria-hidden="true" />
                            <span>Nhân bản</span>
                          </button>
                          {isOpen ? (
                            <button
                              type="button"
                              onClick={() => {
                                setArchiveError(null);
                                setArchiveTarget(cycle);
                              }}
                              className="inline-flex items-center gap-1 rounded-control border border-state-warn-line/50 bg-state-warn-bg/20 px-2.5 py-1 font-medium text-state-warn-fg hover:bg-state-warn-bg/50 transition-colors"
                              title={`Lưu trữ chu kỳ ${cycle.year}`}
                            >
                              <Archive className="w-3 h-3" aria-hidden="true" />
                              <span>Lưu trữ</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-text-muted italic px-2 py-1">
                              Chỉ đọc
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hộp thoại Import */}
      <ImportCycleDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {
          router.refresh();
        }}
      />

      {/* Hộp thoại Clone */}
      <CloneCycleDialog
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        sourceYear={cloneSourceYear}
        availableCycles={cycles}
        onSuccess={() => {
          router.refresh();
        }}
      />

      {/* Hộp thoại xác nhận lưu trữ */}
      {archiveTarget && (
        <ConfirmDialog
          open={!!archiveTarget}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
          }}
          title={`Lưu trữ chu kỳ ${archiveTarget.year}`}
          description={
            <span>
              Bạn có chắc chắn muốn lưu trữ chu kỳ <strong>{archiveTarget.year}</strong>? Sau khi
              lưu trữ, chu kỳ sẽ chuyển sang chế độ <strong>chỉ đọc</strong>. Mọi thao tác thêm,
              sửa, xóa hồ sơ và cập nhật tiến độ trong chu kỳ này sẽ bị vô hiệu hóa.
            </span>
          }
          confirmLabel={isArchiving ? 'Đang lưu trữ...' : 'Xác nhận lưu trữ'}
          cancelLabel="Hủy"
          isDestructive={true}
          isLoading={isArchiving}
          onConfirm={handleConfirmArchive}
        />
      )}
    </div>
  );
}
