import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import IndicatorsView from './IndicatorsView';
import type { components } from '@/lib/api/schema';

type IndicatorListItem = components['schemas']['IndicatorListItem'];
type ProfileSummary = components['schemas']['ProfileSummary'];

const mockIndicators: IndicatorListItem[] = [
  {
    riskCode: 'HD11.R27',
    riskName: 'Rủi ro an toàn thông tin',
    indicator: {
      id: 'ind-uuid-1',
      code: 'HD11.R27.KRI01',
      kind: 'kri',
      name: 'Số sự cố bảo mật thông tin',
      formula: 'Tổng số vụ việc',
      frequency: 'Hàng tháng',
      periodKind: 'month',
      thresholds: {
        green: '< 1 vụ',
        yellow: '1 - 2 vụ',
        red: '> 2 vụ',
      },
      mode: 'manual',
      ownerUnit: null,
      note: null,
      current: {
        periodKey: '2026-10',
        valueText: '0 vụ',
        valueNum: 0,
        zone: 'green',
        zoneSource: 'manual',
        reviewedAt: '2026-11-05T10:00:00Z',
      },
      submitPeriodKeys: [],
      pendingSubmissions: [],
    },
  },
];

const mockProfiles: ProfileSummary[] = [
  {
    riskCode: 'HD11.R27',
    hsrrCode: 'HSRRTY_MBF_2026_HD11.R27',
    name: 'Rủi ro an toàn thông tin',
    riskType: 'Rủi ro vận hành',
    riskZone: 'Khối Cơ quan TCT',
    riskGroup: 'CNTT',
    owner: 'Ban CNTT',
    inherent: {
      impactScore: 5,
      likelihoodScore: 4,
      impactLabel: 'Nghiêm trọng',
      likelihoodLabel: 'Nhiều khả năng xảy ra',
      levelLabel: 'Cực kỳ nghiêm trọng',
    },
    residual: null,
    kri: { total: 1, red: 0, yellow: 0, green: 1, noData: 0 },
    kci: { total: 0, red: 0, yellow: 0, green: 0, noData: 0 },
    actions: { total: 0, completed: 0, inProgress: 0, notStarted: 0, atRisk: 0, overdue: 0 },
    actionProgress: null,
  },
];

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/indicators',
  useSearchParams: () => new URLSearchParams(),
}));

describe('IndicatorsView component', () => {
  it('renders indicators table with code, name, value, and zone', () => {
    render(
      <IndicatorsView
        indicators={mockIndicators}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
      />,
    );

    expect(screen.getByText('HD11.R27.KRI01')).toBeInTheDocument();
    expect(screen.getByText('Số sự cố bảo mật thông tin')).toBeInTheDocument();
    expect(screen.getByText('0 vụ')).toBeInTheDocument();
    expect(screen.getByText('Trong ngưỡng')).toBeInTheDocument();
  });

  it('does not render "Nhập số liệu" or "Rút lại" buttons', () => {
    render(
      <IndicatorsView
        indicators={mockIndicators}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
      />,
    );

    expect(screen.queryByRole('button', { name: /nhập số liệu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rút lại/i })).not.toBeInTheDocument();
  });

  it('renders "Nhập số liệu" button when submitPeriodKeys is not empty', () => {
    const indicatorsWithSubmit: IndicatorListItem[] = [
      {
        ...mockIndicators[0],
        indicator: {
          ...mockIndicators[0].indicator,
          submitPeriodKeys: ['2026-10'],
        },
      },
    ];

    render(
      <IndicatorsView
        indicators={indicatorsWithSubmit}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
      />,
    );

    expect(screen.getByRole('button', { name: /nhập số liệu/i })).toBeInTheDocument();
  });

  it('renders "Chờ duyệt" badge and "Rút lại" button when pending submission has canWithdraw', () => {
    const indicatorsWithPending: IndicatorListItem[] = [
      {
        ...mockIndicators[0],
        indicator: {
          ...mockIndicators[0].indicator,
          pendingSubmissions: [
            {
              id: 'pending-1',
              periodKey: '2026-10',
              submittedAt: '2026-10-12T08:00:00Z',
              submittedByName: 'Nguyễn Văn A',
              canWithdraw: true,
            },
          ],
        },
      },
    ];

    render(
      <IndicatorsView
        indicators={indicatorsWithPending}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
      />,
    );

    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rút lại/i })).toBeInTheDocument();
  });

  it('hides "Lịch sử" button when currentUser role is viewer', () => {
    render(
      <IndicatorsView
        indicators={mockIndicators}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
        currentUser={{
          id: 'u-viewer',
          email: 'viewer@mbf.vn',
          fullName: 'Người xem',
          role: 'viewer',
          unit: null,
          mustChangePassword: false,
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: /lịch sử/i })).not.toBeInTheDocument();
  });

  it('renders empty state when indicators list is empty', () => {
    render(
      <IndicatorsView
        indicators={[]}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
      />,
    );

    expect(screen.getByText('Không có chỉ số rủi ro')).toBeInTheDocument();
  });
});
