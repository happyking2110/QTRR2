import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportsView } from './ReportsView';
import type { components } from '@/lib/api/schema';

type ProfileSummary = components['schemas']['ProfileSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

let mockSearchParams = new URLSearchParams('cycle=2026&period=2026-Q4');

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

describe('ReportsView', () => {
  const mockProfiles: ProfileSummary[] = [
    {
      riskCode: 'HD11.R27',
      hsrrCode: 'HSRR-01',
      name: 'Rủi ro vi phạm an toàn thông tin',
      riskType: 'Hoạt động',
      riskZone: 'red',
      riskGroup: 'Công nghệ',
      owner: 'Ban CNTT',
      inherent: {
        impactLabel: 'Nghiêm trọng',
        likelihoodLabel: 'Nhiều khả năng',
        levelLabel: 'Cao',
        impactScore: 4,
        likelihoodScore: 4,
      },
      residual: null,
      kri: { total: 3, green: 2, yellow: 1, red: 0, noData: 0 },
      kci: { total: 2, green: 2, yellow: 0, red: 0, noData: 0 },
      actions: { total: 2, completed: 1, overdue: 0, atRisk: 0, inProgress: 1, notStarted: 0 },
      actionProgress: 50,
    },
    {
      riskCode: 'TC01.R05',
      hsrrCode: 'HSRR-02',
      name: 'Rủi ro biến động tỷ giá',
      riskType: 'Tài chính',
      riskZone: 'yellow',
      riskGroup: 'Tài chính',
      owner: 'Ban Tài chính',
      inherent: {
        impactLabel: 'Trung bình',
        likelihoodLabel: 'Có thể',
        levelLabel: 'Trung bình',
        impactScore: 3,
        likelihoodScore: 3,
      },
      residual: null,
      kri: { total: 2, green: 1, yellow: 1, red: 0, noData: 0 },
      kci: { total: 1, green: 1, yellow: 0, red: 0, noData: 0 },
      actions: { total: 1, completed: 0, overdue: 0, atRisk: 0, inProgress: 1, notStarted: 0 },
      actionProgress: 80,
    },
  ];

  const adminUser: CurrentUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@mobifone.vn',
    fullName: 'Quản trị viên',
    role: 'admin',
    unit: null,
    mustChangePassword: false,
  };

  const viewerUser: CurrentUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'viewer@mobifone.vn',
    fullName: 'Người xem',
    role: 'viewer',
    unit: null,
    mustChangePassword: false,
  };

  beforeEach(() => {
    mockSearchParams = new URLSearchParams('cycle=2026&period=2026-Q4');
  });

  it('renders summary export link with cycle and period query params for admin', () => {
    render(<ReportsView profiles={mockProfiles} currentUser={adminUser} />);

    expect(screen.getByText('Trung tâm báo cáo & Biểu mẫu')).toBeDefined();
    expect(screen.getByText('Báo cáo tổng quan rủi ro trọng yếu')).toBeDefined();

    const summaryLink = screen.getByTestId('export-summary-button');
    expect(summaryLink).toBeDefined();
    expect(summaryLink.getAttribute('href')).toBe('/api/export/summary?cycle=2026&period=2026-Q4');
  });

  it('renders BM06 download links and print links for admin/ban4/unit', () => {
    render(<ReportsView profiles={mockProfiles} currentUser={adminUser} />);

    // BM06 download link for HD11.R27
    const bm06Link = screen.getByTestId('export-bm06-HD11.R27');
    expect(bm06Link).toBeDefined();
    expect(bm06Link.getAttribute('href')).toBe('/api/export/profile/HD11.R27?cycle=2026&period=2026-Q4');

    // Print link for HD11.R27
    const printLink = screen.getByTestId('print-profile-HD11.R27');
    expect(printLink).toBeDefined();
    expect(printLink.getAttribute('href')).toBe('/profiles/HD11.R27?print=1&cycle=2026&period=2026-Q4');
  });

  it('hides BM06 export buttons for viewer role', () => {
    render(<ReportsView profiles={mockProfiles} currentUser={viewerUser} />);

    // Summary download link is still present
    const summaryLink = screen.getByTestId('export-summary-button');
    expect(summaryLink).toBeDefined();

    // BM06 download buttons are HIDDEN
    expect(screen.queryByTestId('export-bm06-HD11.R27')).toBeNull();
    expect(screen.queryByTestId('export-bm06-TC01.R05')).toBeNull();

    // Print links are still present
    expect(screen.getByTestId('print-profile-HD11.R27')).toBeDefined();

    // Warning note for viewer is displayed
    expect(screen.getByText(/\* Vai trò Người xem \(viewer\) không có quyền tải tệp Excel BM06/i)).toBeDefined();
  });

  it('displays accurate description for summary report without promising unincluded content (S6)', () => {
    render(<ReportsView profiles={mockProfiles} currentUser={adminUser} />);
    const description = screen.getByText(/Báo cáo bao gồm/i);
    expect(description.textContent).not.toContain('ma trận phân bố');
    expect(description.textContent).not.toContain('danh sách các KRI/KCI cần lưu ý');
    expect(description.textContent).toContain('thống kê tổng quan');
    expect(description.textContent).toContain('danh sách hồ sơ rủi ro');
  });
});
