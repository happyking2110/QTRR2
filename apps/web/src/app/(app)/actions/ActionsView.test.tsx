import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActionsView from './ActionsView';
import type { components } from '@/lib/api/schema';

type ActionListItem = components['schemas']['ActionListItem'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type UnitSummary = components['schemas']['UnitSummary'];

const mockActions: ActionListItem[] = [
  {
    riskCode: 'HD11.R27',
    riskName: 'Rủi ro an toàn thông tin',
    action: {
      code: 'HD11.R27.KH01',
      description: 'Nâng cấp tường lửa',
      responsibilityText: 'Ban CNTT',
      deliverable: 'Báo cáo nghiệm thu',
      dueText: '31/12/2026',
      dueDate: '2026-12-31',
      controlCodes: ['KS01'],
      status: 'in_progress',
      progress: 50,
      tasks: [
        {
          id: 'task-1',
          name: 'Đầu việc 1',
          unit: { code: 'CNTT', name: 'Ban Công nghệ thông tin', kind: 'department' },
          dueDate: '2026-12-31',
          weight: 1,
          progress: 50,
          sourceText: null,
          lastApprovedUpdateAt: null,
          submitPeriodKeys: [],
          pendingSubmissions: [],
        },
      ],
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
    kri: { total: 1, red: 0, yellow: 0, green: 0, noData: 1 },
    kci: { total: 1, red: 0, yellow: 0, green: 0, noData: 1 },
    actions: { total: 1, completed: 0, inProgress: 1, notStarted: 0, atRisk: 0, overdue: 0 },
    actionProgress: 50,
  },
];

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
  usePathname: () => '/actions',
  useSearchParams: () => new URLSearchParams(),
}));

describe('ActionsView component', () => {
  it('renders actions table with action code, description, and status', () => {
    render(
      <ActionsView
        actions={mockActions}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
      />,
    );

    expect(screen.getByText('HD11.R27.KH01')).toBeInTheDocument();
    expect(screen.getByText('Nâng cấp tường lửa')).toBeInTheDocument();
    expect(screen.getAllByText('Đang thực hiện').length).toBe(2);
  });

  it('hides unit filter when units array is empty', () => {
    render(
      <ActionsView
        actions={mockActions}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
      />,
    );

    expect(screen.queryByLabelText('Đơn vị')).not.toBeInTheDocument();
  });

  it('shows unit filter when units are provided', () => {
    const units: UnitSummary[] = [
      { code: 'CNTT', name: 'Ban CNTT', kind: 'department' },
    ];
    render(
      <ActionsView
        actions={mockActions}
        profiles={mockProfiles}
        units={units}
        filters={{}}
      />,
    );

    expect(screen.getByLabelText('Đơn vị')).toBeInTheDocument();
  });

  it('renders empty state when actions array is empty', () => {
    render(
      <ActionsView
        actions={[]}
        profiles={mockProfiles}
        units={[]}
        filters={{}}
      />,
    );

    expect(screen.getByText('Không có kế hoạch hành động')).toBeInTheDocument();
  });
});
