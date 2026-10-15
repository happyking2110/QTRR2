import React from 'react';
import { redirect } from 'next/navigation';
import { apiGet, isRedirectError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { AppHeader } from '@/components/layout/AppHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Database } from 'lucide-react';

type CycleSummary = components['schemas']['CycleSummary'];
type PeriodSummary = components['schemas']['PeriodSummary'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type Overview = components['schemas']['Overview'];
type CurrentUser = components['schemas']['CurrentUser'];

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let currentUser: CurrentUser | null = null;
  try {
    currentUser = await apiGet<CurrentUser>('/api/auth/me');
  } catch (err) {
    if (isRedirectError(err)) throw err;
    currentUser = null;
  }

  if (currentUser?.mustChangePassword) {
    redirect('/change-password');
  }

  let cycles: CycleSummary[] = [];
  let periods: PeriodSummary[] = [];
  let profiles: ProfileSummary[] = [];
  let overview: Overview | null = null;
  let apiAvailable = true;

  try {
    cycles = await apiGet<CycleSummary[]>('/api/cycles');
  } catch (err) {
    if (isRedirectError(err)) throw err;
    apiAvailable = false;
    cycles = [];
  }

  // Lấy chu kỳ mở (hoặc chu kỳ đầu tiên)
  const defaultCycle = cycles.find((c) => c.status === 'open') ?? cycles[0];

  if (cycles.length > 0) {
    try {
      const periodsArrays = await Promise.all(
        cycles.map((c) =>
          apiGet<PeriodSummary[]>(`/api/cycles/${c.year}/periods`).catch(() => [])
        )
      );
      periods = periodsArrays.flat();
    } catch (err) {
      if (isRedirectError(err)) throw err;
      periods = [];
    }
  }

  if (defaultCycle) {
    try {
      profiles = await apiGet<ProfileSummary[]>('/api/profiles', {
        cycle: defaultCycle.year,
      });
    } catch (err) {
      if (isRedirectError(err)) throw err;
      profiles = [];
    }

    try {
      overview = await apiGet<Overview>('/api/overview', {
        cycle: defaultCycle.year,
      });
    } catch (err) {
      if (isRedirectError(err)) throw err;
      overview = null;
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg-page text-text font-sans">
      {/* Header chính nền navy */}
      <AppHeader
        cycles={cycles}
        periods={periods}
        profiles={profiles}
        initialOverview={overview}
        selectedCycleYear={defaultCycle ? defaultCycle.year : null}
        currentUser={currentUser}
      />

      {/* Nội dung trang */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-6">
        {/* Tiêu đề in ấn */}
        <div className="hidden print:block mb-4 pb-2 border-b border-black text-xs">
          <div className="flex justify-between items-center">
            <strong className="text-sm">MBF Risk Monitor - Hồ sơ Rủi ro Trọng yếu</strong>
            <span>Thời điểm in: {new Date().toLocaleDateString('vi-VN')}</span>
          </div>
        </div>
        {!apiAvailable && (
          <div className="mb-6">
            <EmptyState
              icon={<Database className="w-10 h-10 text-state-bad-line" aria-hidden="true" />}
              title="Không thể kết nối máy chủ API"
              description="Vui lòng đảm bảo backend API đang chạy trên cổng 3001 và thử tải lại trang."
            />
          </div>
        )}

        {apiAvailable && cycles.length === 0 && (
          <div className="mb-6">
            <EmptyState
              icon={<Database className="w-10 h-10 text-brand-blue" aria-hidden="true" />}
              title="Chưa có chu kỳ nào"
              description="Hệ thống chưa có dữ liệu chu kỳ. Vui lòng chạy lệnh nạp dữ liệu (seed hoặc import) để bắt đầu."
            />
          </div>
        )}

        {children}
      </main>

      {/* Footer */}
      <footer className="bg-surface border-t border-border py-4 mt-auto">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 text-xs text-text-muted text-center sm:text-left break-words">
          <span>MBF Risk Monitor</span>
        </div>
      </footer>
    </div>
  );
}
