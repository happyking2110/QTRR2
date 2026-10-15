import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  ProfileStackedBarCharts,
  ProfileKriChart,
  ProfileActionsChart,
} from './ProfileStackedBarCharts';
import type { components } from '@/lib/api/schema';

type ProfileSummary = components['schemas']['ProfileSummary'];

const mockProfiles: ProfileSummary[] = [
  {
    riskCode: 'HD11.R27',
    hsrrCode: 'HSRRTY_MBF_2026_HD11.R27',
    name: 'An ninh mạng',
    riskType: 'Rủi ro vận hành',
    riskZone: 'Khối CQ',
    riskGroup: 'CNTT',
    owner: 'Ban CNTT',
    inherent: {
      impactScore: 5,
      likelihoodScore: 4,
      impactLabel: 'Nghiêm trọng',
      likelihoodLabel: 'Nhiều khả năng xảy ra',
      levelLabel: 'Cực kỳ nghiêm trọng',
    },
    residual: {
      impactScore: 4,
      likelihoodScore: 3,
      impactLabel: 'Lớn',
      likelihoodLabel: 'Có thể xảy ra',
      levelLabel: 'Cao',
    },
    kri: {
      total: 5,
      green: 2,
      yellow: 2,
      red: 1,
      noData: 0,
    },
    kci: {
      total: 3,
      green: 2,
      yellow: 1,
      red: 0,
      noData: 0,
    },
    actions: {
      total: 6,
      completed: 2,
      inProgress: 2,
      atRisk: 1,
      overdue: 1,
      notStarted: 0,
    },
    actionProgress: 65,
  },
  {
    riskCode: 'CN02.R13',
    hsrrCode: 'HSRRTY_MBF_2026_CN02.R13',
    name: 'Gián đoạn hệ thống',
    riskType: 'Rủi ro vận hành',
    riskZone: 'Khối CQ',
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
    // Hồ sơ chưa có số liệu đã duyệt: tất cả KRI rơi vào noData, hành động rơi vào notStarted
    kri: {
      total: 4,
      green: 0,
      yellow: 0,
      red: 0,
      noData: 4,
    },
    kci: {
      total: 2,
      green: 0,
      yellow: 0,
      red: 0,
      noData: 2,
    },
    actions: {
      total: 3,
      completed: 0,
      inProgress: 0,
      atRisk: 0,
      overdue: 0,
      notStarted: 3,
    },
    actionProgress: 0,
  },
];

describe('ProfileStackedBarCharts component', () => {
  it('renders KRI and Actions chart headings and legends', () => {
    render(<ProfileStackedBarCharts profiles={mockProfiles} />);

    expect(screen.getByText('Trạng thái KRI theo hồ sơ')).toBeInTheDocument();
    expect(screen.getByText('Số KRI theo vùng ngưỡng tại kỳ hiện tại')).toBeInTheDocument();
    expect(screen.getByText('Kế hoạch hành động theo hồ sơ')).toBeInTheDocument();
    expect(screen.getByText('Số kế hoạch theo trạng thái thực hiện')).toBeInTheDocument();

    // Legends and table headers
    expect(screen.getAllByText('Trong ngưỡng').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cảnh báo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vượt ngưỡng').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chưa có số liệu').length).toBeGreaterThan(0);

    expect(screen.getAllByText('Hoàn thành').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đang thực hiện').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Có nguy cơ chậm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quá hạn').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chưa bắt đầu').length).toBeGreaterThan(0);
  });

  it('ensures sum of KRI parts equals total for every profile', () => {
    render(<ProfileKriChart profiles={mockProfiles} />);

    const kriTable = screen.getByRole('table', {
      name: 'Bảng số liệu trạng thái KRI theo hồ sơ',
      hidden: true,
    });
    expect(kriTable).toBeInTheDocument();

    for (const p of mockProfiles) {
      // Tổng các phần phải bằng total
      const calculatedSum = p.kri.green + p.kri.yellow + p.kri.red + p.kri.noData;
      expect(calculatedSum).toBe(p.kri.total);

      // Kiểm tra hàng trong bảng ẩn
      const row = within(kriTable).getByText(p.riskCode).closest('tr');
      expect(row).not.toBeNull();
      if (row) {
        const cells = within(row).getAllByRole('cell');
        // Cells: riskCode, green, yellow, red, noData, total
        expect(cells[0]).toHaveTextContent(p.riskCode);
        expect(cells[1]).toHaveTextContent(String(p.kri.green));
        expect(cells[2]).toHaveTextContent(String(p.kri.yellow));
        expect(cells[3]).toHaveTextContent(String(p.kri.red));
        expect(cells[4]).toHaveTextContent(String(p.kri.noData));
        expect(cells[5]).toHaveTextContent(String(p.kri.total));
      }
    }
  });

  it('ensures sum of Actions parts equals total for every profile and shows noData/notStarted for empty profile', () => {
    render(<ProfileActionsChart profiles={mockProfiles} />);

    const actionsTable = screen.getByRole('table', {
      name: 'Bảng số liệu kế hoạch hành động theo hồ sơ',
      hidden: true,
    });
    expect(actionsTable).toBeInTheDocument();

    for (const p of mockProfiles) {
      const calculatedSum =
        p.actions.completed +
        p.actions.inProgress +
        p.actions.atRisk +
        p.actions.overdue +
        p.actions.notStarted;
      expect(calculatedSum).toBe(p.actions.total);

      const row = within(actionsTable).getByText(p.riskCode).closest('tr');
      expect(row).not.toBeNull();
      if (row) {
        const cells = within(row).getAllByRole('cell');
        // Cells: riskCode, completed, inProgress, atRisk, overdue, notStarted, total
        expect(cells[0]).toHaveTextContent(p.riskCode);
        expect(cells[1]).toHaveTextContent(String(p.actions.completed));
        expect(cells[2]).toHaveTextContent(String(p.actions.inProgress));
        expect(cells[3]).toHaveTextContent(String(p.actions.atRisk));
        expect(cells[4]).toHaveTextContent(String(p.actions.overdue));
        expect(cells[5]).toHaveTextContent(String(p.actions.notStarted));
        expect(cells[6]).toHaveTextContent(String(p.actions.total));
      }
    }

    // Kiểm tra hồ sơ CN02.R13 chưa có số liệu: notStarted = 3, completed = 0
    const emptyRow = within(actionsTable).getByText('CN02.R13').closest('tr');
    expect(emptyRow).not.toBeNull();
    if (emptyRow) {
      const cells = within(emptyRow).getAllByRole('cell');
      expect(cells[5]).toHaveTextContent('3'); // notStarted
      expect(cells[1]).toHaveTextContent('0'); // completed
    }
  });
});
