'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { components } from '@/lib/api/schema';
import { Calendar, ChevronDown } from 'lucide-react';
import { apiSend } from '@/lib/api/client';

type CycleSummary = components['schemas']['CycleSummary'];
type PeriodSummary = components['schemas']['PeriodSummary'];

export interface PeriodSwitcherProps {
  cycles: CycleSummary[];
  periods: PeriodSummary[];
  selectedCycle: number | null;
  selectedPeriod: string | null;
  currentPeriodLabel?: string | null;
}

export function PeriodSwitcher({
  cycles,
  periods,
  selectedCycle,
  selectedPeriod,
  currentPeriodLabel,
}: PeriodSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlCycle = searchParams.get('cycle');
  const activeCycle = urlCycle !== null ? Number(urlCycle) : (selectedCycle ?? '');

  const urlPeriod = searchParams.get('period');
  const activePeriod = urlPeriod !== null ? urlPeriod : (selectedPeriod ?? '');

  const [periodList, setPeriodList] = useState<PeriodSummary[]>(periods);

  useEffect(() => {
    setPeriodList(periods);
  }, [periods]);

  useEffect(() => {
    if (!activeCycle) return;
    const matchesCycle = periodList.some((p) => p.key.startsWith(`${activeCycle}-`));
    if (!matchesCycle) {
      apiSend<PeriodSummary[]>('GET', `/api/cycles/${activeCycle}/periods`)
        .then((data) => {
          if (Array.isArray(data)) {
            setPeriodList((prev) => [
              ...prev.filter((p) => !p.key.startsWith(`${activeCycle}-`)),
              ...data,
            ]);
          }
        })
        .catch(() => {});
    }
  }, [activeCycle, periodList]);

  const handleCycleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCycle = e.target.value;
    const currentParams = new URLSearchParams(searchParams.toString());
    if (newCycle) {
      currentParams.set('cycle', newCycle);
      currentParams.delete('period'); // xóa period để trang tự chọn kỳ mặc định của chu kỳ mới
    } else {
      currentParams.delete('cycle');
      currentParams.delete('period');
    }
    router.push(`${pathname}?${currentParams.toString()}`);
  };

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPeriod = e.target.value;
    const currentParams = new URLSearchParams(searchParams.toString());
    if (newPeriod) {
      currentParams.set('period', newPeriod);
    } else {
      currentParams.delete('period');
    }
    router.push(`${pathname}?${currentParams.toString()}`);
  };

  if (cycles.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-white/10 text-white/70 text-xs font-medium border border-white/20">
        <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Chưa có chu kỳ</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Chu kỳ */}
      <div className="flex items-center">
        <label htmlFor="cycle-select" className="sr-only">
          Chọn chu kỳ
        </label>
        <span className="text-white/70 font-medium mr-1.5 hidden sm:inline">
          Chu kỳ:
        </span>
        <div className="relative flex items-center">
          <select
            id="cycle-select"
            value={activeCycle}
            onChange={handleCycleChange}
            className="appearance-none bg-white/10 border border-white/20 rounded-control px-2.5 py-1.5 pr-7 font-medium text-white hover:border-white/40 focus:outline-none focus:ring-2 focus:ring-brand-bright cursor-pointer"
          >
            {cycles.map((c) => (
              <option key={c.year} value={c.year} className="bg-slate-900 text-white">
                {c.year} {c.status === 'archived' ? '(Lưu trữ)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown
            className="w-3.5 h-3.5 text-white/70 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Kỳ báo cáo */}
      <div className="flex items-center">
        <label htmlFor="period-select" className="sr-only">
          Chọn kỳ báo cáo
        </label>
        <span className="text-white/70 font-medium mr-1.5 hidden sm:inline">
          Kỳ:
        </span>
        {(() => {
          const nonMonthlyPeriods = periodList.filter((p) => {
            if (activeCycle && !p.key.startsWith(`${activeCycle}-`)) {
              return false;
            }
            return p.kind !== 'month' && !p.label.startsWith('Tháng');
          });
          if (nonMonthlyPeriods.length === 0) {
            return (
              <span className="px-2.5 py-1.5 bg-white/10 text-white/70 rounded-control border border-white/20 font-medium">
                Chưa có kỳ
              </span>
            );
          }
          return (
            <div className="relative flex items-center">
              <select
                id="period-select"
                value={activePeriod}
                onChange={handlePeriodChange}
                className="appearance-none bg-white/10 border border-white/20 rounded-control px-2.5 py-1.5 pr-7 font-medium text-white hover:border-white/40 focus:outline-none focus:ring-2 focus:ring-brand-bright cursor-pointer max-w-[160px] sm:max-w-none truncate"
              >
                <option value="" className="bg-slate-900 text-white">
                  {currentPeriodLabel
                    ? `Kỳ hiện hành (mặc định - ${currentPeriodLabel})`
                    : 'Kỳ hiện hành (mặc định)'}
                </option>
                {nonMonthlyPeriods.map((p) => (
                  <option key={p.key} value={p.key} className="bg-slate-900 text-white">
                    {p.label} {p.closed ? '(Đã khóa)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="w-3.5 h-3.5 text-white/70 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
