'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { components } from '@/lib/api/schema';

type HeatmapPoint = components['schemas']['HeatmapPoint'];
type ScaleLevel = components['schemas']['ScaleLevel'];

export interface HeatMatrixProps {
  points: HeatmapPoint[];
  impactLevels?: ScaleLevel[];
  likelihoodLevels?: ScaleLevel[];
  scaleProvisional?: boolean;
  className?: string;
  defaultMode?: 'residual' | 'inherent';
}

const DEFAULT_IMPACT_LEVELS: ScaleLevel[] = [
  { score: 1, label: 'Rất thấp' },
  { score: 2, label: 'Thấp' },
  { score: 3, label: 'Trung bình' },
  { score: 4, label: 'Cao' },
  { score: 5, label: 'Nghiêm trọng' },
];

const DEFAULT_LIKELIHOOD_LEVELS: ScaleLevel[] = [
  { score: 5, label: 'Gần như chắc chắn' },
  { score: 4, label: 'Nhiều khả năng' },
  { score: 3, label: 'Có thể' },
  { score: 2, label: 'Ít khả năng' },
  { score: 1, label: 'Hiếm khi' },
];

function getCellColorClass(score: number): { bg: string; text: string } {
  if (score <= 4) {
    return { bg: 'bg-[#e7f6e7]', text: 'text-[#006300]' };
  }
  if (score <= 9) {
    return { bg: 'bg-[#fff5dc]', text: 'text-[#7a5200]' };
  }
  if (score <= 15) {
    return { bg: 'bg-[#fdeee6]', text: 'text-[#9a3b12]' };
  }
  return { bg: 'bg-[#fbe9e9]', text: 'text-[#9b1c1c]' };
}

export function HeatMatrix({
  points,
  impactLevels = DEFAULT_IMPACT_LEVELS,
  likelihoodLevels = DEFAULT_LIKELIHOOD_LEVELS,
  scaleProvisional = true,
  className,
  defaultMode,
}: HeatMatrixProps) {
  // Có ít nhất 1 hồ sơ có residual thì mặc định residual, ngược lại inherent
  const hasAnyResidual = points.some((p) => p.residual !== null);
  const initialMode = defaultMode ?? (hasAnyResidual ? 'residual' : 'inherent');
  const [mode, setMode] = useState<'residual' | 'inherent'>(initialMode);

  // Sắp xếp khả năng 5 -> 1 (từ trên xuống)
  const sortedLikelihoods = [...likelihoodLevels].sort((a, b) => b.score - a.score);
  // Sắp xếp tác động 1 -> 5 (từ trái sang phải)
  const sortedImpacts = [...impactLevels].sort((a, b) => a.score - b.score);

  // Danh sách hồ sơ chưa nhập mức còn lại
  const missingResidual = points.filter((p) => p.residual === null);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Header ma trận: Tiêu đề và Nút chuyển chế độ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text">Ma trận rủi ro</h2>
          <p className="text-xs text-text-muted">
            Vị trí các hồ sơ theo khả năng xảy ra × mức độ tác động
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-bg-tint p-1 text-xs font-medium border border-border/60">
          <button
            type="button"
            onClick={() => setMode('residual')}
            className={cn(
              'rounded-md px-3 py-1.5 transition',
              mode === 'residual'
                ? 'bg-surface font-semibold text-text shadow-xs ring-1 ring-black/5'
                : 'text-text-muted hover:text-text',
            )}
          >
            Rủi ro còn lại
          </button>
          <button
            type="button"
            onClick={() => setMode('inherent')}
            className={cn(
              'rounded-md px-3 py-1.5 transition',
              mode === 'inherent'
                ? 'bg-surface font-semibold text-text shadow-xs ring-1 ring-black/5'
                : 'text-text-muted hover:text-text',
            )}
          >
            Rủi ro tiềm ẩn
          </button>
        </div>
      </div>

      {/* Vùng lưới ma trận */}
      <div className="overflow-x-auto">
        <div className="min-w-[500px] flex gap-2">
          {/* Nhãn trục dọc xoay 90 độ */}
          <div className="flex w-6 items-center justify-center">
            <span className="-rotate-90 whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Khả năng xảy ra
            </span>
          </div>

          <div className="flex-1">
            {/* Lưới 5x5 */}
            <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-1 text-xs">
              {sortedLikelihoods.map((lik) => (
                <React.Fragment key={lik.score}>
                  {/* Nhãn hàng khả năng */}
                  <div className="flex items-center justify-end pr-2 text-right text-[11px] leading-tight text-text-muted">
                    <span>
                      <span className="font-semibold text-text">{lik.score}</span>{' '}
                      {lik.label}
                    </span>
                  </div>

                  {/* 5 ô tác động */}
                  {sortedImpacts.map((imp) => {
                    const score = lik.score * imp.score;
                    const color = getCellColorClass(score);

                    // Lọc hồ sơ nằm trong ô này
                    const inCell = points.filter((p) => {
                      const assessment = mode === 'residual' ? p.residual : p.inherent;
                      if (!assessment) return false;
                      return (
                        assessment.likelihoodScore === lik.score &&
                        assessment.impactScore === imp.score
                      );
                    });

                    return (
                      <div
                        key={imp.score}
                        data-testid={`matrix-cell-${lik.score}-${imp.score}`}
                        className={cn(
                          'relative flex min-h-[56px] flex-wrap items-center justify-center gap-1 rounded-sm p-1.5 transition',
                          color.bg,
                          color.text,
                        )}
                        title={`${lik.score} × ${imp.score} = ${score}`}
                      >
                        <span className="absolute top-1 right-1 text-[10px] opacity-40 font-semibold tabular-nums pointer-events-none">
                          {score}
                        </span>

                        {inCell.map((p) => (
                          <Link
                            key={p.riskCode}
                            href={`/profiles/${p.riskCode}`}
                            className="rounded-md bg-brand-navy px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-xs ring-2 ring-white transition hover:bg-brand-bright"
                            title={`${p.riskCode} – ${p.name} (Tiềm ẩn: ${p.inherent.levelLabel}${p.residual ? `, Còn lại: ${p.residual.levelLabel}` : ''})`}
                          >
                            {p.riskCode}
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}

              {/* Hàng nhãn tác động dưới cùng */}
              <div />
              {sortedImpacts.map((imp) => (
                <div
                  key={imp.score}
                  className="pt-1 text-center text-[11px] leading-tight text-text-muted"
                >
                  <span className="font-semibold text-text">{imp.score}</span>{' '}
                  {imp.label}
                </div>
              ))}
            </div>

            {/* Nhãn trục ngang */}
            <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Mức độ tác động
            </p>
          </div>
        </div>
      </div>

      {/* Chú thích & Thông tin dưới ma trận */}
      <div className="space-y-1.5 pt-1 text-xs">
        {mode === 'residual' && missingResidual.length > 0 && (
          <p className="text-text-muted">
            <span className="font-medium text-text">Chưa nhập mức còn lại:</span>{' '}
            {missingResidual.map((p) => p.riskCode).join(', ')}
          </p>
        )}

        {scaleProvisional && (
          <p className="text-amber-800 bg-amber-50/80 rounded px-2.5 py-1 border border-amber-200/60 inline-block">
            Thang 5 mức tạm thời, đang chờ Ban 4 xác nhận
          </p>
        )}

        <p className="text-[11px] text-text-muted italic">
          Màu nền chỉ thể hiện điểm khả năng × tác động (1–4: Xanh lá, 5–9: Vàng, 10–15: Cam, 16–25: Đỏ)
        </p>
      </div>

      {/* Bảng tương đương ẩn cho trình đọc màn hình (a11y) */}
      <div className="sr-only">
        <table aria-label="Bảng phân bố hồ sơ rủi ro trên ma trận nhiệt">
          <thead>
            <tr>
              <th scope="col">Mã hồ sơ</th>
              <th scope="col">Tên hồ sơ</th>
              <th scope="col">Khả năng</th>
              <th scope="col">Mức tác động</th>
              <th scope="col">Mức rủi ro</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const assessment = mode === 'residual' ? p.residual : p.inherent;
              return (
                <tr key={p.riskCode}>
                  <td>{p.riskCode}</td>
                  <td>{p.name}</td>
                  <td>{assessment ? assessment.likelihoodScore : 'Chưa nhập'}</td>
                  <td>{assessment ? assessment.impactScore : 'Chưa nhập'}</td>
                  <td>{assessment ? assessment.levelLabel : 'Chưa nhập'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
