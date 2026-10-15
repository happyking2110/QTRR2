import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileDetailView from './ProfileDetailView';
import type { components } from '@/lib/api/schema';

type ProfileDetail = components['schemas']['ProfileDetail'];

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/profiles/HD11.R27',
  useSearchParams: () => mockSearchParams,
}));

const mockDetail4C: ProfileDetail = {
  profile: {
    riskCode: 'HD11.R27',
    hsrrCode: 'HSRRTY_MBF_2026_HD11.R27',
    name: 'Rủi ro gián đoạn hệ thống CNTT',
    riskType: 'Rủi ro vận hành',
    riskZone: 'Khối Cơ quan TCT',
    riskGroup: 'Hạ tầng',
    owner: 'Ban CNTT',
    inherent: {
      impactScore: 5,
      likelihoodScore: 4,
      score: 20,
      impactLabel: 'Nghiêm trọng',
      likelihoodLabel: 'Nhiều khả năng xảy ra',
      levelLabel: 'Rất cao',
    },
    residual: {
      impactScore: 3,
      likelihoodScore: 3,
      score: 9,
      impactLabel: 'Vừa',
      likelihoodLabel: 'Có thể',
      levelLabel: 'Trung bình',
    },
    kri: { total: 2, red: 1, yellow: 0, green: 1, noData: 0 },
    kci: { total: 2, red: 0, yellow: 1, green: 1, noData: 0 },
    actions: { total: 1, completed: 0, inProgress: 1, notStarted: 0, atRisk: 0, overdue: 0 },
    actionProgress: 60,
  },
  period: {
    key: '2026-Q4',
    name: 'Quý 4/2026',
    year: 2026,
    isCurrent: true,
    isLocked: false,
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    dueDate: '2027-01-15',
  },
  description: 'Mô tả tóm tắt rủi ro dòng 1\nMô tả chi tiết rủi ro dòng 2\nMô tả chi tiết rủi ro dòng 3',
  relatedActivity: 'Vận hành hệ thống',
  preparedByUnit: 'Ban CNTT',
  causes: [
    { code: 'NN01', group: 'Hạ tầng', description: 'Sự cố nguồn điện', controlCodes: ['KS01'] },
  ],
  impacts: [
    { code: 'AH01', group: 'Dịch vụ', description: 'Ngừng trệ dịch vụ nội bộ', level: 'Lớn' },
  ],
  controls: [
    {
      code: 'KS01',
      description: 'Hệ thống máy phát điện dự phòng',
      ownerText: 'Ban CNTT',
      units: [{ code: 'CNTT', name: 'Ban CNTT', kind: 'department' }],
      frequency: 'Hàng tháng',
      objective: 'Phòng ngừa',
      method: 'Tự động',
      designEff: 'Hiệu quả',
      operatingEff: 'Hiệu quả',
      overallEff: 'Hiệu quả',
      needsSupplement: false,
      actionCodes: ['KH01'],
      causeCodes: ['NN01'],
    },
  ],
  actions: [
    {
      code: 'KH01',
      description: 'Bảo dưỡng định kỳ máy phát điện UPS',
      responsibilityText: 'Ban CNTT',
      deliverable: 'Biên bản nghiệm thu',
      dueText: '31/12/2026',
      dueDate: '2026-12-31',
      controlCodes: ['KS01'],
      status: 'in_progress',
      progress: 60,
      tasks: [],
    },
  ],
  indicators: [
    {
      id: 'ind-kri-1',
      code: 'HD11.R27.KRI01',
      kind: 'kri',
      name: 'Số sự cố mất điện trạm chính',
      formula: 'Tổng số sự cố',
      frequency: 'Hàng tháng',
      periodKind: 'month',
      unitKind: 'count',
      unitLabel: 'vụ',
      direction: 'higher_is_worse',
      yellowAt: 1,
      redAt: 2,
      targetValue: null,
      targetProgress: null,
      dataSource: 'Nhật ký vận hành TT CNTT',
      thresholds: {
        green: '= 0 vụ',
        yellow: '1 - 2 vụ',
        red: '> 2 vụ',
      },
      mode: 'auto',
      ownerUnit: { code: 'CNTT', name: 'Ban CNTT', kind: 'department' },
      note: null,
      current: {
        periodKey: '2026-M10',
        valueText: '2',
        valueNum: 2,
        zone: 'red',
        approvedAt: '2026-10-10T00:00:00Z',
      },
      submitPeriodKeys: [],
      pendingSubmissions: [],
    },
    {
      id: 'ind-kri-2',
      code: 'HD11.R27.KRI02',
      kind: 'kri',
      name: 'Tỷ lệ khả dụng của hệ thống Core',
      formula: 'Thời gian hoạt động / Tổng thời gian',
      frequency: 'Hàng tháng',
      periodKind: 'month',
      unitKind: 'percent',
      unitLabel: '%',
      direction: 'lower_is_worse',
      yellowAt: 95,
      redAt: 80,
      targetValue: null,
      targetProgress: null,
      dataSource: null,
      thresholds: {
        green: '≥ 95%',
        yellow: '80 - 95%',
        red: '< 80%',
      },
      mode: 'auto',
      ownerUnit: null,
      note: null,
      current: {
        periodKey: '2026-M10',
        valueText: '98,5',
        valueNum: 98.5,
        zone: 'green',
        approvedAt: '2026-10-10T00:00:00Z',
      },
      submitPeriodKeys: [],
      pendingSubmissions: [],
    },
    {
      id: 'ind-kci-1',
      code: 'HD11.R27.KCI01',
      kind: 'kci',
      name: 'Tỷ lệ kiểm tra định kỳ UPS đúng hạn',
      formula: 'Số lần kiểm tra đúng hạn / Tổng số lần',
      frequency: 'Hàng quý',
      periodKind: 'quarter',
      unitKind: 'percent',
      unitLabel: '%',
      direction: 'lower_is_worse',
      yellowAt: 90,
      redAt: 75,
      targetValue: 100,
      targetProgress: 92,
      dataSource: 'Biên bản kiểm tra kỹ thuật',
      thresholds: {
        green: '100%',
        yellow: '90 - 99%',
        red: '< 90%',
      },
      mode: 'auto',
      ownerUnit: { code: 'CNTT', name: 'Ban CNTT', kind: 'department' },
      note: null,
      current: {
        periodKey: '2026-Q3',
        valueText: '92',
        valueNum: 92,
        zone: 'yellow',
        approvedAt: '2026-09-30T00:00:00Z',
      },
      submitPeriodKeys: [],
      pendingSubmissions: [],
    },
    {
      id: 'ind-kci-2',
      code: 'HD11.R27.KCI02',
      kind: 'kci',
      name: 'Chỉ số KCI chưa đặt mục tiêu',
      formula: '',
      frequency: 'Hàng quý',
      periodKind: 'quarter',
      unitKind: 'percent',
      unitLabel: '%',
      direction: null,
      yellowAt: null,
      redAt: null,
      targetValue: null,
      targetProgress: null,
      dataSource: null,
      thresholds: null,
      mode: 'manual',
      ownerUnit: null,
      note: null,
      current: {
        periodKey: '2026-Q3',
        valueText: '85',
        valueNum: 85,
        zone: 'green',
        approvedAt: '2026-09-30T00:00:00Z',
      },
      submitPeriodKeys: [],
      pendingSubmissions: [],
    },
  ],
  residualHistory: [],
};

const adminUser = {
  id: 'u-admin',
  email: 'admin@mobifone.vn',
  fullName: 'Admin User',
  role: 'admin' as const,
  unit: null,
  mustChangePassword: false,
};

const ban4User = {
  id: 'u-ban4',
  email: 'ban4@mobifone.vn',
  fullName: 'Ban 4 User',
  role: 'ban4' as const,
  unit: null,
  mustChangePassword: false,
};

describe('Plan 4C Frontend Specifications (W2 - W6)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  describe('W2: Layout and BM06 region', () => {
    it('removes anchor navigation bar and arranges 4 sequential main sections', () => {
      const { container } = render(<ProfileDetailView detail={mockDetail4C} />);

      // Không còn thanh neo aria-label="Điều hướng hồ sơ rủi ro"
      expect(screen.queryByRole('navigation', { name: 'Điều hướng hồ sơ rủi ro' })).toBeNull();

      // Có 4 khối chính: summary, kri, kci, actions
      expect(container.querySelector('#summary')).not.toBeNull();
      expect(container.querySelector('#kri')).not.toBeNull();
      expect(container.querySelector('#kci')).not.toBeNull();
      expect(container.querySelector('#actions')).not.toBeNull();
    });

    it('collapses BM06 section by default, expands when clicked, and has aria-expanded', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      const bm06Trigger = screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i });
      expect(bm06Trigger).toBeInTheDocument();
      expect(bm06Trigger).toHaveAttribute('aria-expanded', 'false');

      // Khi gập: 3 khối Kiểm soát, Nguyên nhân & ảnh hưởng, Thông tin chung không hiện trong DOM hoặc bị ẩn
      expect(screen.queryByText('1. Nguyên nhân rủi ro (1)')).toBeNull();

      // Click để mở
      fireEvent.click(bm06Trigger);
      expect(bm06Trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('1. Nguyên nhân rủi ro (1)')).toBeInTheDocument();
    });

    it('always expands BM06 section when ?print=1', () => {
      mockSearchParams = new URLSearchParams('print=1');
      render(<ProfileDetailView detail={mockDetail4C} />);

      const bm06Trigger = screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i });
      expect(bm06Trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('1. Nguyên nhân rủi ro (1)')).toBeInTheDocument();
    });

    it('clicking "Xem đầy đủ" expands BM06 section', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      const viewFullBtn = screen.getByRole('button', { name: 'Xem đầy đủ' });
      expect(viewFullBtn).toBeInTheDocument();

      fireEvent.click(viewFullBtn);
      const bm06Trigger = screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i });
      expect(bm06Trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('1. Nguyên nhân rủi ro (1)')).toBeInTheDocument();
    });
  });

  describe('W3: Summary card risk rating boxes', () => {
    it('renders inherent and residual risk boxes with K x T and score * levelLabel', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      // Ô 1: Tiềm ẩn: K4 × T5, badge 20 · Rất cao
      expect(screen.getByText('Rủi ro tiềm ẩn')).toBeInTheDocument();
      expect(screen.getByText(/K4 × T5/)).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('Rất cao')).toBeInTheDocument();

      // Ô 2: Còn lại: K3 × T3, badge 9 · Trung bình
      expect(screen.getByText('Rủi ro còn lại')).toBeInTheDocument();
      expect(screen.getByText(/K3 × T3/)).toBeInTheDocument();
      expect(screen.getByText('9')).toBeInTheDocument();
      expect(screen.getByText('Trung bình')).toBeInTheDocument();

      // Không có ô Rủi ro mục tiêu
      expect(screen.queryByText(/Rủi ro mục tiêu/i)).toBeNull();
    });

    it('shows "Chưa nhập" when residual risk is null', () => {
      const detailWithoutResidual = {
        ...mockDetail4C,
        profile: { ...mockDetail4C.profile, residual: null },
      };
      render(<ProfileDetailView detail={detailWithoutResidual} />);

      expect(screen.getByText('Chưa nhập')).toBeInTheDocument();
    });
  });

  describe('W4: KRI block', () => {
    it('renders numeric thresholds with higher_is_worse (≥ 1 / 2) and lower_is_worse (≤ 95 / 80)', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      // KRI01 (higher_is_worse): yellow 1, red 2 -> ≥ 1 / 2
      expect(screen.getByText('≥ 1 / 2')).toBeInTheDocument();
      // KRI02 (lower_is_worse): yellow 95, red 80 -> ≤ 95 / 80
      expect(screen.getByText('≤ 95 / 80')).toBeInTheDocument();
    });

    it('displays direction label "Càng cao càng xấu" or "Càng thấp càng xấu"', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      expect(screen.getByText(/Càng cao càng xấu/)).toBeInTheDocument();
      expect(screen.getByText(/Càng thấp càng xấu/)).toBeInTheDocument();
    });

    it('displays unitLabel in current value column', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      // KRI01 valueText 2, unitLabel vụ
      expect(screen.getByText('2 vụ')).toBeInTheDocument();
      // KRI02 valueText 98,5, unitLabel %
      expect(screen.getByText('98,5%')).toBeInTheDocument();
    });

    it('displays dataSource in selected KRI details panel', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      // KRI01 có dataSource
      expect(screen.getByText(/Nguồn dữ liệu:/)).toBeInTheDocument();
      expect(screen.getByText(/Nhật ký vận hành TT CNTT/)).toBeInTheDocument();
    });
  });

  describe('W5: KCI block', () => {
    it('renders targetProgress bar with 92% / 100% and vertical yellowAt marker', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      // Text 92% / 100%
      expect(screen.getByText('92% / 100%')).toBeInTheDocument();
      // Subtext vạch dọc
      expect(screen.getByText(/Vạch dọc: mức tối thiểu 90%/)).toBeInTheDocument();
      // Đánh giá zone yellow -> Cần cải thiện
      expect(screen.getByText('Cần cải thiện')).toBeInTheDocument();
    });

    it('shows "Chưa đặt mục tiêu" when indicator has no targetValue', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      expect(screen.getByText('Chưa đặt mục tiêu')).toBeInTheDocument();
    });

    it('clamps bar width at 100% when targetProgress > 100% but shows real number', () => {
      const overTargetDetail = {
        ...mockDetail4C,
        indicators: [
          {
            ...mockDetail4C.indicators[2],
            targetProgress: 120,
          },
        ],
      };
      render(<ProfileDetailView detail={overTargetDetail} />);

      expect(screen.getByText('120% / 100%')).toBeInTheDocument();
      const progressBar = screen.getByTestId('kci-target-progress-bar');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });
  });

  describe('W6: Button permissions (Admin vs Ban4)', () => {
    it('shows target setting, add, and edit buttons only to Admin', () => {
      render(<ProfileDetailView detail={mockDetail4C} currentUser={adminUser} />);

      expect(screen.getByTestId('add-kri-button')).toBeInTheDocument();
      expect(screen.getByTestId('add-kci-button')).toBeInTheDocument();
      expect(screen.getByTestId('edit-kri-HD11.R27.KRI01')).toBeInTheDocument();
      expect(screen.getByTestId('edit-kci-HD11.R27.KCI01')).toBeInTheDocument();
      expect(screen.getByTestId('targets-kri-HD11.R27.KRI01')).toBeInTheDocument();
      expect(screen.getByTestId('targets-kci-HD11.R27.KCI01')).toBeInTheDocument();
      expect(screen.getByTestId('delete-kri-HD11.R27.KRI01')).toBeInTheDocument();
    });

    it('hides add, edit, and target setting buttons for Ban4, but keeps delete button', () => {
      render(<ProfileDetailView detail={mockDetail4C} currentUser={ban4User} />);

      expect(screen.queryByTestId('add-kri-button')).toBeNull();
      expect(screen.queryByTestId('add-kci-button')).toBeNull();
      expect(screen.queryByTestId('edit-kri-HD11.R27.KRI01')).toBeNull();
      expect(screen.queryByTestId('edit-kci-HD11.R27.KCI01')).toBeNull();
      expect(screen.queryByTestId('targets-kri-HD11.R27.KRI01')).toBeNull();
      expect(screen.queryByTestId('targets-kci-HD11.R27.KCI01')).toBeNull();

      // Ban4 vẫn có quyền xóa
      expect(screen.getByTestId('delete-kri-HD11.R27.KRI01')).toBeInTheDocument();
      expect(screen.getByTestId('delete-kci-HD11.R27.KCI01')).toBeInTheDocument();
    });
  });

  describe('Action plan block link', () => {
    it('includes link "Mở trong bảng kế hoạch" to /actions?profile={riskCode}', () => {
      render(<ProfileDetailView detail={mockDetail4C} />);

      const link = screen.getByRole('link', { name: /Mở trong bảng kế hoạch/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/actions?profile=HD11.R27');
    });
  });
});
