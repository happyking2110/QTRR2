'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  FileSpreadsheet,
  Download,
  Printer,
  FileText,
  Info,
  Calendar,
} from 'lucide-react';
import type { components } from '@/lib/api/schema';

type ProfileSummary = components['schemas']['ProfileSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

export interface ReportsViewProps {
  profiles: ProfileSummary[];
  currentUser?: CurrentUser | null;
}

export function ReportsView({ profiles, currentUser }: ReportsViewProps) {
  const searchParams = useSearchParams();
  const cycleParam = searchParams?.get('cycle') || '2026';
  const periodParam = searchParams?.get('period') || '';

  const isViewer = currentUser?.role === 'viewer';
  const canExportBM06 = !isViewer;

  const summaryExportUrl = `/api/export/summary?cycle=${encodeURIComponent(cycleParam)}${
    periodParam ? `&period=${encodeURIComponent(periodParam)}` : ''
  }`;

  const getBM06ExportUrl = (riskCode: string) =>
    `/api/export/profile/${encodeURIComponent(riskCode)}?cycle=${encodeURIComponent(cycleParam)}${
      periodParam ? `&period=${encodeURIComponent(periodParam)}` : ''
    }`;

  const getPrintUrl = (riskCode: string) =>
    `/profiles/${encodeURIComponent(riskCode)}?print=1${cycleParam ? `&cycle=${cycleParam}` : ''}${
      periodParam ? `&period=${periodParam}` : ''
    }`;

  return (
    <div className="space-y-8">
      {/* Tiêu đề trang */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Xuất dữ liệu và báo cáo
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-text mt-0.5">
          Trung tâm báo cáo & Biểu mẫu
        </h1>
        <p className="text-xs sm:text-sm text-text-muted mt-1">
          Tải báo cáo tổng quan dạng Excel (.xlsx), biểu mẫu BM06 theo hồ sơ rủi ro, hoặc xem bản in chuẩn A4.
        </p>
      </div>

      {/* Thông tin kỳ & chu kỳ đang chọn */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-xs text-text shadow-sm">
        <div className="flex items-center gap-1.5 font-semibold text-brand-navy">
          <Calendar className="w-4 h-4 text-brand-blue" aria-hidden="true" />
          <span>Chu kỳ:</span>
          <span className="text-brand-blue">{cycleParam}</span>
        </div>
        <span className="text-border">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">Kỳ báo cáo:</span>
          <span className="font-semibold text-text">{periodParam || 'Kỳ hiện hành'}</span>
        </div>
        <span className="text-border">|</span>
        <span className="text-text-muted text-[11px]">
          (Sử dụng bộ chọn chu kỳ và kỳ trên thanh điều hướng để thay đổi phạm vi dữ liệu xuất)
        </span>
      </div>

      {/* 1. BÁO CÁO TỔNG QUAN */}
      <section className="space-y-3" aria-labelledby="section-summary-report">
        <h2 id="section-summary-report" className="text-base font-bold text-text flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-brand-blue" aria-hidden="true" />
          <span>Báo cáo tổng quan rủi ro trọng yếu</span>
        </h2>

        <div className="rounded-card border border-border bg-surface p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <h3 className="text-sm font-bold text-text">
              Tệp tổng hợp dữ liệu toàn chu kỳ ({cycleParam})
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Báo cáo bao gồm các thẻ thống kê tổng quan (số hồ sơ, tiến độ kế hoạch trung bình, phân bổ KRI/KCI,
              trạng thái kế hoạch hành động) và danh sách hồ sơ rủi ro trọng yếu tính đến thời điểm báo cáo.
            </p>
          </div>

          <a
            href={summaryExportUrl}
            download
            data-testid="export-summary-button"
            className="inline-flex items-center justify-center gap-2 rounded-control bg-brand-blue px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-navy transition-colors shadow-sm shrink-0"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Tải báo cáo tổng quan (.xlsx)</span>
          </a>
        </div>
      </section>

      {/* 2. HỒ SƠ THEO BIỂU MẪU BM06 */}
      <section className="space-y-3" aria-labelledby="section-bm06-reports">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 id="section-bm06-reports" className="text-base font-bold text-text flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-blue" aria-hidden="true" />
            <span>Biểu mẫu BM06 theo hồ sơ rủi ro</span>
          </h2>
          {isViewer && (
            <span className="text-[11px] text-text-muted italic">
              * Vai trò Người xem (viewer) không có quyền tải tệp Excel BM06
            </span>
          )}
        </div>

        <div className="rounded-card border border-border bg-surface overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-bg-tint/70 text-text-muted uppercase text-[10px] tracking-wider border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Mã hồ sơ
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Tên rủi ro
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Loại rủi ro
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Vùng rủi ro
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {profiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                      Chưa có hồ sơ rủi ro nào trong chu kỳ này.
                    </td>
                  </tr>
                ) : (
                  profiles.map((p) => (
                    <tr key={p.riskCode} className="hover:bg-bg-tint/30 transition-colors">
                      <td className="px-4 py-3 font-bold font-mono text-brand-navy">
                        <Link
                          href={`/profiles/${encodeURIComponent(p.riskCode)}`}
                          className="hover:underline hover:text-brand-blue"
                        >
                          {p.riskCode}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-text max-w-md">
                        {p.name}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {p.riskType}
                      </td>
                      <td className="px-4 py-3 font-medium text-text">
                        {p.riskZone}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {canExportBM06 && (
                            <a
                              href={getBM06ExportUrl(p.riskCode)}
                              download
                              data-testid={`export-bm06-${p.riskCode}`}
                              className="inline-flex items-center gap-1 rounded-control border border-border bg-surface px-2.5 py-1 text-xs font-medium text-brand-blue hover:bg-bg-tint hover:border-brand-blue transition-colors shadow-sm"
                              title={`Tải biểu mẫu BM06 của ${p.riskCode}`}
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Tải BM06 (.xlsx)</span>
                            </a>
                          )}
                          <Link
                            href={getPrintUrl(p.riskCode)}
                            target="_blank"
                            data-testid={`print-profile-${p.riskCode}`}
                            className="inline-flex items-center gap-1 rounded-control border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text hover:bg-bg-tint transition-colors shadow-sm"
                            title={`Xem bản in chuẩn A4 của ${p.riskCode}`}
                          >
                            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Xem bản in</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3. HƯỚNG DẪN IN VÀ LƯU PDF */}
      <section className="space-y-3" aria-labelledby="section-print-instructions">
        <h2 id="section-print-instructions" className="text-base font-bold text-text flex items-center gap-2">
          <Printer className="w-4 h-4 text-brand-blue" aria-hidden="true" />
          <span>Hướng dẫn in và xuất PDF chuẩn A4</span>
        </h2>

        <div className="rounded-card border border-border bg-surface p-5 text-xs text-text space-y-2.5 shadow-sm">
          <div className="flex items-start gap-2 text-text-muted">
            <Info className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1.5 leading-relaxed">
              <p>
                Hệ thống hỗ trợ in trực tiếp hoặc lưu dưới dạng tệp PDF theo tiêu chuẩn khổ giấy <strong>A4</strong> (lề 15mm)
                ngay từ trình duyệt của bạn:
              </p>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-text-muted">
                <li>
                  Bấm nút <strong>&quot;Xem bản in&quot;</strong> tại hồ sơ rủi ro tương ứng ở bảng trên, hoặc chọn nút <strong>In</strong> trên thanh công cụ của trang Tổng quan/Hồ sơ.
                </li>
                <li>
                  Trình duyệt sẽ hiển thị giao diện tinh gọn chuẩn in (đã tự động ẩn thanh điều hướng, nút thao tác và bộ lọc; có đầu trang gồm tên sản phẩm, chu kỳ, kỳ và thông tin người in).
                </li>
                <li>
                  Nhấn tổ hợp phím <kbd className="rounded border border-border bg-bg-tint px-1.5 py-0.5 font-mono text-[11px]">Ctrl + P</kbd> (hoặc <kbd className="rounded border border-border bg-bg-tint px-1.5 py-0.5 font-mono text-[11px]">Cmd + P</kbd> trên macOS).
                </li>
                <li>
                  Tại ô <em>Máy in đích (Destination)</em>, chọn <strong>Lưu dưới dạng PDF (Save as PDF)</strong> để tải file PDF về máy tính.
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
