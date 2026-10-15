'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ShieldCheck, ChevronDown, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PeriodSwitcher } from '@/components/domain/PeriodSwitcher';
import { UserNavMenu } from '@/components/layout/UserNavMenu';
import { formatDate } from '@/lib/format';
import type { components } from '@/lib/api/schema';

type CycleSummary = components['schemas']['CycleSummary'];
type PeriodSummary = components['schemas']['PeriodSummary'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type Overview = components['schemas']['Overview'];
type CurrentUser = components['schemas']['CurrentUser'];

export interface AppHeaderProps {
  cycles: CycleSummary[];
  periods: PeriodSummary[];
  profiles: ProfileSummary[];
  initialOverview?: Overview | null;
  selectedCycleYear?: number | null;
  currentUser?: CurrentUser | null;
}

export function AppHeader({
  cycles,
  periods,
  profiles,
  initialOverview,
  selectedCycleYear,
  currentUser,
}: AppHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [overview, setOverview] = useState<Overview | null>(initialOverview ?? null);
  const [riskMenuOpen, setRiskMenuOpen] = useState(false);
  const riskMenuRef = useRef<HTMLDivElement>(null);
  const riskTriggerRef = useRef<HTMLButtonElement>(null);

  // Đóng menu Mã Rủi ro khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (riskMenuRef.current && !riskMenuRef.current.contains(event.target as Node)) {
        setRiskMenuOpen(false);
      }
    }
    if (riskMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [riskMenuOpen]);

  // Đóng menu Mã Rủi ro khi nhấn phím Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && riskMenuOpen) {
        setRiskMenuOpen(false);
        riskTriggerRef.current?.focus();
      }
    }
    if (riskMenuOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [riskMenuOpen]);

  const cycleParam = searchParams.get('cycle');
  const periodParam = searchParams.get('period');
  const navParams = new URLSearchParams();
  if (cycleParam) navParams.set('cycle', cycleParam);
  if (periodParam) navParams.set('period', periodParam);
  const queryString = navParams.toString();
  const makeHref = (basePath: string) => {
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  useEffect(() => {
    let isMounted = true;
    const cycleParam = searchParams.get('cycle');
    const periodParam = searchParams.get('period');

    const params = new URLSearchParams();
    if (cycleParam) params.set('cycle', cycleParam);
    if (periodParam) params.set('period', periodParam);

    const url = `/api/overview${params.toString() ? `?${params.toString()}` : ''}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) {
          setOverview(data);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const activeYear = overview?.cycle?.year ?? selectedCycleYear ?? 2026;
  const currentPeriodLabel = overview?.period?.label;
  const asOfDateText =
    overview?.hasApprovedData && overview?.asOfDate
      ? `Dữ liệu đến ngày ${formatDate(overview.asOfDate)}`
      : 'Chưa có số liệu đã duyệt';

  return (
    <header className="bg-brand-navy text-white shadow-sm sticky top-0 z-30 max-w-full">
      {/* Hàng 1: Logo MBF + Thanh điều hướng (7 mục) + Cụm nhãn kỳ trên màn hình lớn */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-2.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 lg:gap-6 min-w-0">
        {/* Logo / Tên thương hiệu + User menu mobile */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          <Link
            href={makeHref('/')}
            className="flex items-center gap-2 rounded focus:outline-none focus:ring-2 focus:ring-brand-bright shrink-0"
          >
            <span className="grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-lg bg-brand-bright text-white shadow-xs shrink-0">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-xs sm:text-sm font-bold tracking-tight text-white whitespace-nowrap">
                MBF Risk Monitor
              </span>
              <span className="block text-[10px] sm:text-[11px] text-white/70 whitespace-nowrap">
                Hồ sơ rủi ro trọng yếu {activeYear}
              </span>
            </span>
          </Link>
          {currentUser && (
            <div className="lg:hidden shrink-0">
              <UserNavMenu user={currentUser} />
            </div>
          )}
        </div>

        {/* Thanh điều hướng: Trên màn hình lớn (>=1024px) hiện đầy đủ, không cuộn; trên mobile/tablet cuộn ngang căn trái */}
        <nav
          aria-label="Điều hướng chính"
          className="flex items-center gap-1 overflow-x-auto lg:overflow-visible scrollbar-none py-0.5 w-full lg:w-auto lg:flex-1 lg:flex-wrap justify-start -mx-1 px-1 min-w-0"
        >
          <Link
            href={makeHref('/')}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap',
              pathname === '/'
                ? 'bg-white/15 !text-white font-semibold'
                : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            Tổng quan
          </Link>
          {/* Menu thả xuống "Mã Rủi ro" dạng thư mục */}
          <div className="relative shrink-0" ref={riskMenuRef}>
            <button
              ref={riskTriggerRef}
              type="button"
              onClick={() => setRiskMenuOpen(!riskMenuOpen)}
              aria-haspopup="true"
              aria-expanded={riskMenuOpen}
              aria-label="Menu danh sách Mã Rủi ro"
              className={cn(
                'shrink-0 rounded-lg px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap inline-flex items-center gap-1.5 border',
                pathname.startsWith('/profiles') || riskMenuOpen
                  ? 'bg-white/15 !text-white font-semibold border-white/40 shadow-xs'
                  : 'text-white/80 hover:bg-white/10 hover:text-white border-white/20',
              )}
            >
              <span>Mã Rủi ro</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 opacity-80 transition-transform duration-150',
                  riskMenuOpen && 'rotate-180',
                )}
                aria-hidden="true"
              />
            </button>

            {riskMenuOpen && (
              <div
                role="menu"
                aria-orientation="vertical"
                className="absolute left-0 mt-1.5 w-52 sm:w-56 origin-top-left rounded-xl bg-white shadow-xl ring-1 ring-black/5 p-1.5 z-50 focus:outline-none text-slate-800 animate-in fade-in zoom-in-95 duration-100"
              >
                {profiles.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400 text-center">
                    Chưa có hồ sơ
                  </div>
                ) : (
                  profiles.map((p) => {
                    const isCurrent = pathname.startsWith(`/profiles/${p.riskCode}`);
                    return (
                      <Link
                        key={p.riskCode}
                        href={makeHref(`/profiles/${p.riskCode}`)}
                        onClick={() => setRiskMenuOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors',
                          isCurrent
                            ? 'bg-blue-50 text-blue-900 font-semibold'
                            : 'text-slate-800 hover:bg-slate-100/80 hover:text-slate-900',
                        )}
                        role="menuitem"
                      >
                        <File className="h-4 w-4 text-slate-700 shrink-0" aria-hidden="true" />
                        <span className="font-mono text-xs sm:text-sm tracking-tight">
                          {p.riskCode}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>
          <Link
            href={makeHref('/actions')}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap',
              pathname.startsWith('/actions')
                ? 'bg-white/15 !text-white font-semibold'
                : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
            aria-current={pathname.startsWith('/actions') ? 'page' : undefined}
          >
            Kế hoạch hành động
          </Link>
          <Link
            href={makeHref('/indicators')}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap',
              pathname.startsWith('/indicators')
                ? 'bg-white/15 !text-white font-semibold'
                : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
            aria-current={pathname.startsWith('/indicators') ? 'page' : undefined}
          >
            Chỉ số
          </Link>
          <Link
            href={makeHref('/reports')}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap',
              pathname.startsWith('/reports')
                ? 'bg-white/15 !text-white font-semibold'
                : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
            aria-current={pathname.startsWith('/reports') ? 'page' : undefined}
          >
            Báo cáo
          </Link>
        </nav>

        {/* Cụm thông tin kỳ & ngày chốt trên màn hình lớn (>=1024px) + User menu desktop */}
        <div className="hidden lg:flex items-center gap-4 text-right text-xs text-white/70 leading-tight shrink-0">
          <div>
            <div>
              <span>Kỳ báo cáo: </span>
              <span className="font-semibold text-white">
                {currentPeriodLabel ?? 'Kỳ hiện hành'}
              </span>
            </div>
            <div className="text-[11px] text-white/60">{asOfDateText}</div>
          </div>
          {currentUser && <UserNavMenu user={currentUser} />}
        </div>
      </div>

      {/* Hàng 2: Dải chọn chu kỳ và kỳ báo cáo */}
      <div className="border-t border-white/10 bg-black/15">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-1.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <PeriodSwitcher
              cycles={cycles}
              periods={periods}
              selectedCycle={selectedCycleYear ?? null}
              selectedPeriod={null}
              currentPeriodLabel={currentPeriodLabel}
            />
          </div>
          {/* Trên màn hình < 1024px, hiển thị tóm tắt kỳ & ngày ở hàng 2 này */}
          <div className="text-right text-[11px] sm:text-xs text-white/70 leading-tight shrink-0 lg:hidden">
            <div>
              <span className="hidden sm:inline">Kỳ báo cáo: </span>
              <span className="font-semibold text-white">
                {currentPeriodLabel ?? 'Kỳ hiện hành'}
              </span>
            </div>
            <div className="hidden sm:block text-[10px] text-white/60">{asOfDateText}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
