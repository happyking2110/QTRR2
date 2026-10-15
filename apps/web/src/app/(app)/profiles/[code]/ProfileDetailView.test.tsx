import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import ProfileDetailView from './ProfileDetailView';
import type { components } from '@/lib/api/schema';

type ProfileDetail = components['schemas']['ProfileDetail'];

const mockProfileDetail: ProfileDetail = {
  profile: {
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
    actions: { total: 1, completed: 0, inProgress: 0, notStarted: 1, atRisk: 0, overdue: 0 },
    actionProgress: null,
  },
  period: null,
  description: 'Mô tả rủi ro dòng 1\n- Gạch đầu dòng thứ nhất\n- Gạch đầu dòng thứ hai',
  relatedActivity: 'Vận hành trung tâm dữ liệu',
  preparedByUnit: 'Ban CNTT',
  causes: [
    {
      code: 'NN01',
      group: 'Hệ thống',
      description: 'Lỗi phần mềm ứng dụng',
      controlCodes: ['KS01'],
    },
  ],
  impacts: [
    {
      code: 'AH01',
      group: 'Hoạt động',
      description: 'Gián đoạn dịch vụ thoại',
      level: 'Lớn',
    },
  ],
  controls: [
    {
      code: 'KS01',
      description: 'Quy trình kiểm soát định kỳ',
      ownerText: 'Ban CNTT',
      units: [{ code: 'CNTT', name: 'Ban Công nghệ thông tin', kind: 'department' }],
      frequency: 'Hàng tháng',
      objective: 'Phòng ngừa',
      method: 'Bán tự động',
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
      description: 'Nâng cấp hệ thống tường lửa',
      responsibilityText: 'Ban CNTT chủ trì',
      deliverable: 'Báo cáo nghiệm thu',
      dueText: 'Quý 4/2026',
      dueDate: null,
      controlCodes: ['KS01'],
      status: 'not_started',
      progress: 0,
      tasks: [
        {
          id: 'task-uuid-1',
          name: 'Đầu việc không có hạn và đơn vị',
          unit: null,
          dueDate: null,
          weight: 1,
          progress: 0,
          sourceText: 'Trách nhiệm: Ban CNTT',
          lastApprovedUpdateAt: null,
          submitPeriodKeys: [],
          pendingSubmissions: [],
        },
      ],
    },
  ],
  indicators: [
    {
      id: 'ind-uuid-1',
      code: 'HD11.R27.KRI01',
      kind: 'kri',
      name: 'Số sự cố bảo mật thông tin',
      formula: 'Tổng số sự cố',
      frequency: 'Hàng tháng',
      periodKind: 'month',
      thresholds: {
        green: '= 0 vụ',
        yellow: '1 - 2 vụ',
        red: '> 2 vụ',
      },
      mode: 'manual',
      ownerUnit: null,
      note: null,
      current: null, // Chưa có số đo duyệt
      submitPeriodKeys: [],
      pendingSubmissions: [],
    },
  ],
  residualHistory: [
    {
      periodKey: 'Q3/2026',
      rating: {
        impactScore: 4,
        likelihoodScore: 3,
        impactLabel: 'Lớn',
        likelihoodLabel: 'Có thể xảy ra',
        levelLabel: 'Cao',
      },
    },
  ],
};

const mockEmptyProfileDetail: ProfileDetail = {
  ...mockProfileDetail,
  causes: [],
  impacts: [],
  controls: [],
  actions: [],
  indicators: [],
  residualHistory: [],
};

let mockSearchParams = new URLSearchParams();

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/profiles/HD11.R27',
  useSearchParams: () => mockSearchParams,
}));

describe('ProfileDetailView component (single scrolling page, no tabs)', () => {
  it('renders 4 main blocks on a single page, no tabs, and collapsible BM06 region', () => {
    const { container } = render(<ProfileDetailView detail={mockProfileDetail} />);

    // Kiểm tra không có component Tabs của Radix
    expect(container.querySelector('[role="tablist"]')).toBeNull();

    // Kiểm tra không có thanh neo (Anchor bar đã bỏ theo 4C)
    expect(screen.queryByRole('navigation', { name: 'Điều hướng hồ sơ rủi ro' })).toBeNull();

    // Kiểm tra sự hiện diện của 4 khối chính qua id trên trang
    expect(container.querySelector('#summary')).not.toBeNull();
    expect(container.querySelector('#kri')).not.toBeNull();
    expect(container.querySelector('#kci')).not.toBeNull();
    expect(container.querySelector('#actions')).not.toBeNull();

    // Vùng BM06 có nút trigger
    expect(screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i })).toBeInTheDocument();
  });

  it('renders summary card with title, 2 rating boxes (NO target risk), causes and impacts', () => {
    render(<ProfileDetailView detail={mockProfileDetail} />);

    expect(screen.getByText('HỒ SƠ RỦI RO HD11.R27')).toBeInTheDocument();
    expect(screen.getByText('Rủi ro an toàn thông tin')).toBeInTheDocument();

    // 2 ô mức: Tiềm ẩn và Còn lại
    expect(screen.getByText('Rủi ro tiềm ẩn')).toBeInTheDocument();
    expect(screen.getByText('Rủi ro còn lại')).toBeInTheDocument();
    // Tuyệt đối không có "Rủi ro mục tiêu"
    expect(screen.queryByText(/Rủi ro mục tiêu/i)).toBeNull();

    // Nguyên nhân chính & Hậu quả tiềm ẩn
    expect(screen.getByText('Nguyên nhân chính')).toBeInTheDocument();
    expect(screen.getAllByText(/Lỗi phần mềm ứng dụng/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Hậu quả tiềm ẩn')).toBeInTheDocument();
    expect(screen.getAllByText(/Gián đoạn dịch vụ thoại/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders KRI, Actions, Controls, and General info preserving all fields', () => {
    render(<ProfileDetailView detail={mockProfileDetail} />);

    // KRI info
    expect(screen.getAllByText('HD11.R27.KRI01').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Chọn vùng thủ công')).toBeInTheDocument();
    expect(screen.getByText('= 0 vụ')).toBeInTheDocument();

    // Actions info
    expect(screen.getAllByText('KH01').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Nâng cấp hệ thống tường lửa')).toBeInTheDocument();

    // Mở vùng BM06 để thấy Controls và General info
    fireEvent.click(screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i }));

    // Controls info
    expect(screen.getAllByText('KS01').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Quy trình kiểm soát định kỳ')).toBeInTheDocument();

    // General info
    expect(screen.getAllByText(/Gạch đầu dòng thứ nhất/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Vận hành trung tâm dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Q3/2026')).toBeInTheDocument();
  });

  it('handles empty lists gracefully without errors', () => {
    render(<ProfileDetailView detail={mockEmptyProfileDetail} />);
    expect(screen.getByText('Chưa có chỉ số KRI')).toBeInTheDocument();
    expect(screen.getByText('Chưa có chỉ số KCI')).toBeInTheDocument();
    expect(screen.getByText('Chưa có kế hoạch hành động')).toBeInTheDocument();

    // Mở vùng BM06 để thấy danh sách rỗng bên trong
    fireEvent.click(screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i }));
    expect(screen.getByText('Chưa có biện pháp kiểm soát')).toBeInTheDocument();
    expect(screen.getByText('Chưa có dữ liệu nguyên nhân')).toBeInTheDocument();
    expect(screen.getByText('Chưa có dữ liệu ảnh hưởng')).toBeInTheDocument();
  });

  it('displays complete multi-line causes and impacts without losing lines after newline (S3)', () => {
    const multiLineDetail: ProfileDetail = {
      ...mockProfileDetail,
      causes: [
        {
          code: 'NN02',
          group: 'Kỹ thuật',
          description: 'Dòng 1 nguyên nhân\nDòng 2 nguyên nhân chi tiết\nDòng 3 nguyên nhân bổ sung',
          controlCodes: [],
        },
      ],
      impacts: [
        {
          code: 'AH02',
          group: 'Tài chính',
          description: 'Dòng 1 hậu quả\nDòng 2 hậu quả chi tiết',
          level: 'Nghiêm trọng',
        },
      ],
    };

    const { container } = render(<ProfileDetailView detail={multiLineDetail} />);

    const summaryCard = container.querySelector('#summary') as HTMLElement;
    expect(summaryCard).not.toBeNull();

    // Kiểm tra dòng 2 và 3 của nguyên nhân vẫn hiện diện trong thẻ tóm tắt (không bị cắt mất do split('\n')[0])
    expect(within(summaryCard).getByText(/Dòng 2 nguyên nhân chi tiết/)).toBeInTheDocument();
    expect(within(summaryCard).getByText(/Dòng 3 nguyên nhân bổ sung/)).toBeInTheDocument();

    // Kiểm tra dòng 2 của hậu quả vẫn hiện diện trong thẻ tóm tắt
    expect(within(summaryCard).getByText(/Dòng 2 hậu quả chi tiết/)).toBeInTheDocument();
  });

  it('renders "Nhập mức còn lại" button for admin/ban4 and opens ResidualAssessmentDialog', () => {
    const adminUser = {
      id: 'u-admin',
      email: 'admin@mobifone.vn',
      fullName: 'Admin',
      role: 'admin' as const,
      unit: null,
      mustChangePassword: false,
    };

    const viewerUser = {
      id: 'u-viewer',
      email: 'viewer@mobifone.vn',
      fullName: 'Viewer',
      role: 'viewer' as const,
      unit: null,
      mustChangePassword: false,
    };

    // 1. Viewer user should NOT see the button
    const { rerender } = render(
      <ProfileDetailView detail={mockProfileDetail} currentUser={viewerUser} />,
    );
    expect(screen.queryByTestId('open-residual-dialog-btn')).not.toBeInTheDocument();

    // 2. Admin user SHOULD see the button
    rerender(<ProfileDetailView detail={mockProfileDetail} currentUser={adminUser} />);
    const btn = screen.getByTestId('open-residual-dialog-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('Nhập mức còn lại');

    // Click button opens dialog
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Nhập mức rủi ro còn lại')).toBeInTheDocument();
  });

  it('hides edit, delete, and add buttons for unit and viewer users; hides BM06 for viewer', () => {
    const viewerUser: components['schemas']['CurrentUser'] = {
      id: 'viewer-1',
      email: 'viewer@mobifone.vn',
      fullName: 'Người xem',
      role: 'viewer',
      unit: null,
      mustChangePassword: false,
    };

    render(<ProfileDetailView detail={mockProfileDetail} currentUser={viewerUser} />);

    expect(screen.queryByTestId('edit-profile-button')).toBeNull();
    expect(screen.queryByTestId('delete-profile-button')).toBeNull();
    expect(screen.queryByTestId('export-bm06-button')).toBeNull();
    expect(screen.queryByTestId('add-kri-button')).toBeNull();
    expect(screen.queryByTestId('add-kci-button')).toBeNull();
    expect(screen.queryByTestId('add-action-button')).toBeNull();
    expect(screen.queryByTestId('add-control-button')).toBeNull();
    expect(screen.queryByTestId('add-cause-button')).toBeNull();
    expect(screen.queryByTestId('add-impact-button')).toBeNull();
  });

  it('shows edit, delete, add buttons, and BM06 export for admin and ban4 users', () => {
    const adminUser: components['schemas']['CurrentUser'] = {
      id: 'admin-1',
      email: 'admin@mobifone.vn',
      fullName: 'Quản trị viên',
      role: 'admin',
      unit: null,
      mustChangePassword: false,
    };

    render(<ProfileDetailView detail={mockProfileDetail} currentUser={adminUser} />);

    expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
    expect(screen.getByTestId('delete-profile-button')).toBeInTheDocument();
    expect(screen.getByTestId('export-bm06-button')).toBeInTheDocument();
    expect(screen.getByTestId('add-kri-button')).toBeInTheDocument();
    expect(screen.getByTestId('add-kci-button')).toBeInTheDocument();
    expect(screen.getByTestId('add-action-button')).toBeInTheDocument();

    // Mở vùng BM06 để kiểm tra các nút thêm trong BM06
    fireEvent.click(screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i }));
    expect(screen.getByTestId('add-control-button')).toBeInTheDocument();
    expect(screen.getByTestId('add-cause-button')).toBeInTheDocument();
    expect(screen.getByTestId('add-impact-button')).toBeInTheDocument();
  });

  it('renders PrintHeader and print guidance banner when print=1', () => {
    mockSearchParams = new URLSearchParams('print=1&cycle=2026&period=2026-Q4');

    render(<ProfileDetailView detail={mockProfileDetail} />);

    expect(screen.getByTestId('print-header')).toBeInTheDocument();
    expect(screen.getByText(/Bản in chuẩn A4:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In trang ngay' })).toBeInTheDocument();

    // Reset searchParams
    mockSearchParams = new URLSearchParams();
  });
});

