import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OverviewView from './OverviewView';
import type { components } from '@/lib/api/schema';

type Overview = components['schemas']['Overview'];
type Heatmap = components['schemas']['Heatmap'];
type ProfileSummary = components['schemas']['ProfileSummary'];

const mockOverviewNoData: Overview = {
  cycle: { year: 2026, status: 'open' },
  period: null,
  hasApprovedData: false,
  asOfDate: null,
  profileCount: 4,
  kri: { total: 9, red: 0, yellow: 0, green: 0, noData: 9 },
  kci: { total: 12, red: 0, yellow: 0, green: 0, noData: 12 },
  actions: { total: 10, completed: 0, inProgress: 0, notStarted: 10, atRisk: 0, overdue: 0 },
  actionProgressAverage: null,
};

const mockHeatmap: Heatmap = {
  scaleProvisional: true,
  impactLevels: [],
  likelihoodLevels: [],
  points: [],
};

const mockProfiles: ProfileSummary[] = [
  {
    riskCode: 'HD11.R27',
    hsrrCode: 'HSRRTY_MBF_2026_HD11.R27',
    name: 'Rủi ro bảo mật thông tin',
    riskType: 'Rủi ro hoạt động',
    riskZone: 'Khối CQ TCT',
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
    kri: { total: 3, red: 0, yellow: 0, green: 0, noData: 3 },
    kci: { total: 3, red: 0, yellow: 0, green: 0, noData: 3 },
    actions: { total: 3, completed: 0, inProgress: 0, notStarted: 3, atRisk: 0, overdue: 0 },
    actionProgress: null,
  },
];

describe('OverviewView component', () => {
  it('displays PageHero and "Chưa có số liệu" in KRI/KCI cards when hasApprovedData is false', () => {
    render(
      <OverviewView
        overview={mockOverviewNoData}
        heatmap={mockHeatmap}
        profiles={mockProfiles}
        alertKri={[]}
        urgentActions={[]}
      />,
    );

    // Kiểm tra PageHero
    expect(screen.getByText('Tổng quan rủi ro trọng yếu 2026')).toBeInTheDocument();

    // Kiểm tra thẻ KRI và KCI có nhãn "Chưa có số liệu"
    const noDataLabels = screen.getAllByText('Chưa có số liệu');
    expect(noDataLabels.length).toBeGreaterThanOrEqual(3);

    // KRI stat card testId kri-stat-value
    const kriValue = screen.getByTestId('kri-stat-value');
    expect(kriValue).toHaveTextContent('Chưa có số liệu');
    expect(kriValue).not.toHaveTextContent('0');

    // KCI stat card testId kci-stat-value
    const kciValue = screen.getByTestId('kci-stat-value');
    expect(kciValue).toHaveTextContent('Chưa có số liệu');
    expect(kciValue).not.toHaveTextContent('0');
  });

  it('displays formatted asOfDate in footer when asOfDate is provided', () => {
    const overviewWithDate: Overview = {
      ...mockOverviewNoData,
      hasApprovedData: true,
      asOfDate: '2027-01-05',
    };

    render(
      <OverviewView
        overview={overviewWithDate}
        heatmap={mockHeatmap}
        profiles={mockProfiles}
        alertKri={[]}
        urgentActions={[]}
      />,
    );

    expect(
      screen.getByText('Số liệu đã duyệt đến ngày 05/01/2027'),
    ).toBeInTheDocument();
  });
});
