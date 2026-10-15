import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ApprovalsView from './ApprovalsView';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/approvals',
  useSearchParams: () => new URLSearchParams(),
}));

type ReadingApprovalItem = components['schemas']['ReadingApprovalItem'];
type TaskUpdateApprovalItem = components['schemas']['TaskUpdateApprovalItem'];
type CurrentUser = components['schemas']['CurrentUser'];

const mockAdminUser: CurrentUser = {
  id: 'user-admin',
  fullName: 'Quản trị viên MBF',
  email: 'admin@mbf.vn',
  role: 'admin',
  unit: null,
  mustChangePassword: false,
};

const mockUnitUser: CurrentUser = {
  id: 'user-unit',
  fullName: 'Chuyên viên TT1',
  email: 'cv_tt1@mbf.vn',
  role: 'unit',
  unit: { code: 'TT1', name: 'Trung tâm Mạng lưới 1', kind: 'center' },
  mustChangePassword: false,
};

const mockReadingApprovable: ReadingApprovalItem = {
  kind: 'reading',
  riskCode: 'HD11.R27',
  targetName: 'Tỷ lệ thuê bao gián đoạn',
  canApprove: true,
  current: {
    periodKey: '2026-09',
    valueNum: 4,
    valueText: null,
    zone: 'green',
    zoneSource: 'auto',
    reviewedAt: '2026-10-01T00:00:00Z',
  },
  submission: {
    id: 'sub-read-1',
    indicatorId: 'ind-1',
    indicatorCode: 'HD11.R27.KRI01',
    periodKey: '2026-10',
    valueNum: 7.5,
    valueText: null,
    zone: 'yellow',
    zoneSource: 'auto',
    zoneNote: null,
    note: 'Sự cố bảo trì cáp quang',
    status: 'pending',
    submittedBy: { fullName: 'Trần Văn B', unitName: 'TT1' },
    submittedAt: '2026-10-12T10:00:00Z',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  },
};

const mockReadingSelfSubmitted: ReadingApprovalItem = {
  kind: 'reading',
  riskCode: 'HD11.R27',
  targetName: 'Số sự cố CNTT nghiêm trọng',
  canApprove: false, // Self-approval not allowed
  current: null,
  submission: {
    id: 'sub-read-2',
    indicatorId: 'ind-2',
    indicatorCode: 'HD11.R27.KRI02',
    periodKey: '2026-10',
    valueNum: null,
    valueText: 'Không phát sinh sự cố',
    zone: 'green',
    zoneSource: 'manual',
    zoneNote: 'Không có sự cố mức 1',
    note: null,
    status: 'pending',
    submittedBy: { fullName: 'Quản trị viên MBF', unitName: null },
    submittedAt: '2026-10-12T11:00:00Z',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  },
};

const mockTaskUpdateItem: TaskUpdateApprovalItem = {
  kind: 'task_update',
  riskCode: 'HD11.R27',
  targetName: 'Nâng cấp giám sát',
  canApprove: true,
  currentProgress: 0,
  submission: {
    id: 'sub-task-1',
    taskId: 'task-1',
    actionCode: 'HD11.R27.A01',
    taskName: 'Nâng cấp hệ thống giám sát tải mạng',
    periodKey: '2026-Q4',
    progress: 30,
    note: 'Đã hoàn thành đấu nối hạ tầng',
    status: 'pending',
    submittedBy: { fullName: 'Lê Văn C', unitName: 'TT1' },
    submittedAt: '2026-10-12T14:00:00Z',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  },
};

describe('ApprovalsView component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tabs with counters and displays reading comparison column', () => {
    render(
      <ApprovalsView
        items={[mockReadingApprovable, mockReadingSelfSubmitted, mockTaskUpdateItem]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockAdminUser}
      />,
    );

    // Tab counters
    expect(screen.getByRole('tab', { name: /số liệu chỉ số/i })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /tiến độ đầu việc/i })).toHaveTextContent('1');

    // Indicator codes
    expect(screen.getByText('HD11.R27.KRI01')).toBeInTheDocument();
    expect(screen.getByText('HD11.R27.KRI02')).toBeInTheDocument();

    // Comparison display
    expect(screen.getByText('7,5%')).toBeInTheDocument();
    expect(screen.getAllByText(/so với:/i)).toHaveLength(2);
    expect(screen.getByText(/4% \(Xanh, 2026-09\)/)).toBeInTheDocument();
  });

  it('disables checkbox and approve button for items where canApprove is false', () => {
    render(
      <ApprovalsView
        items={[mockReadingApprovable, mockReadingSelfSubmitted]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockAdminUser}
      />,
    );

    const approvableCheckbox = screen.getByLabelText('Chọn chỉ số HD11.R27.KRI01');
    const selfCheckbox = screen.getByLabelText('Chọn chỉ số HD11.R27.KRI02');

    expect(approvableCheckbox).not.toBeDisabled();
    expect(selfCheckbox).toBeDisabled();
    expect(selfCheckbox).toHaveAttribute('title', 'Bạn không thể duyệt bản của chính mình');

    const approveButtons = screen.getAllByRole('button', { name: 'Duyệt' });
    // First button (for mockReadingApprovable) is enabled
    expect(approveButtons[0]).not.toBeDisabled();
    // Second button (for mockReadingSelfSubmitted) is disabled
    expect(approveButtons[1]).toBeDisabled();
  });

  it('submits single approve POST /api/readings/:id/approve', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({});

    render(
      <ApprovalsView
        items={[mockReadingApprovable]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockAdminUser}
      />,
    );

    const approveBtn = screen.getByRole('button', { name: 'Duyệt' });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('POST', '/api/readings/sub-read-1/approve');
    });
  });

  it('requires reason with 5 to 500 characters when rejecting', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({});

    render(
      <ApprovalsView
        items={[mockReadingApprovable]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockAdminUser}
      />,
    );

    const rejectBtn = screen.getByRole('button', { name: 'Từ chối' });
    fireEvent.click(rejectBtn);

    // Dialog appears
    expect(screen.getByRole('dialog', { name: /từ chối bản nộp/i })).toBeInTheDocument();

    const textarea = screen.getByLabelText(/lý do từ chối/i);
    const confirmRejectBtn = screen.getByRole('button', { name: 'Xác nhận từ chối' });

    // Disabled initially (0 characters)
    expect(confirmRejectBtn).toBeDisabled();

    // Type 3 characters (less than 5)
    fireEvent.change(textarea, { target: { value: 'Sai' } });
    expect(confirmRejectBtn).toBeDisabled();

    // Type valid reason
    fireEvent.change(textarea, { target: { value: 'Số liệu không khớp với báo cáo mạng lưới' } });
    expect(confirmRejectBtn).not.toBeDisabled();

    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/readings/sub-read-1/reject',
        { reason: 'Số liệu không khớp với báo cáo mạng lưới' },
      );
    });
  });

  it('performs bulk approval with POST /api/approvals/bulk-approve', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({ approved: 1 });

    render(
      <ApprovalsView
        items={[mockReadingApprovable, mockReadingSelfSubmitted]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockAdminUser}
      />,
    );

    // Click select all
    const selectAllCheckbox = screen.getByLabelText('Chọn tất cả các mục hợp lệ để duyệt');
    fireEvent.click(selectAllCheckbox);

    // Only mockReadingApprovable is selected (count: 1)
    const bulkBtn = screen.getByRole('button', { name: /duyệt các mục đã chọn \(1\)/i });
    expect(bulkBtn).toBeInTheDocument();

    fireEvent.click(bulkBtn);

    // Confirmation dialog
    const confirmBtn = screen.getByRole('button', { name: 'Duyệt 1 mục' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('POST', '/api/approvals/bulk-approve', {
        items: [{ kind: 'reading', id: 'sub-read-1' }],
      });
    });
  });

  it('displays error details banner when bulk approval fails with details array', async () => {
    vi.spyOn(client, 'apiSend').mockRejectedValue(
      new client.ApiClientError({
        code: 'PERIOD_CLOSED',
        message: 'Kỳ báo cáo đã đóng',
        statusCode: 409,
        details: [
          {
            kind: 'reading',
            id: 'sub-read-1',
            code: 'HD11.R27.KRI01',
            message: 'Kỳ 2026-10 đã bị khóa',
          },
        ],
      }),
    );

    render(
      <ApprovalsView
        items={[mockReadingApprovable]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockAdminUser}
      />,
    );

    const checkbox = screen.getByLabelText('Chọn chỉ số HD11.R27.KRI01');
    fireEvent.click(checkbox);

    const bulkBtn = screen.getByRole('button', { name: /duyệt các mục đã chọn \(1\)/i });
    fireEvent.click(bulkBtn);

    const confirmBtn = screen.getByRole('button', { name: 'Duyệt 1 mục' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/lỗi duyệt hàng loạt: kỳ báo cáo đã đóng/i)).toBeInTheDocument();
      expect(screen.getByText(/kỳ 2026-10 đã bị khóa/i)).toBeInTheDocument();
    });
  });

  it('switches to task_update tab and verifies task comparison column and approval', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({});

    render(
      <ApprovalsView
        items={[mockReadingApprovable, mockTaskUpdateItem]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockAdminUser}
      />,
    );

    const taskTab = screen.getByRole('tab', { name: /tiến độ đầu việc/i });
    fireEvent.click(taskTab);

    // Task details visible
    expect(screen.getByText('Nâng cấp hệ thống giám sát tải mạng')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText(/so với:/i)).toBeInTheDocument();

    const approveBtn = screen.getByRole('button', { name: 'Duyệt' });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('POST', '/api/task-updates/sub-task-1/approve');
    });
  });

  it('renders read-only view for unit role with no approve/reject buttons', () => {
    render(
      <ApprovalsView
        items={[mockReadingApprovable]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockUnitUser}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
    expect(screen.getByText('Chỉ đọc')).toBeInTheDocument();
  });

  it('renders EmptyState when there are no items in current tab', () => {
    render(
      <ApprovalsView
        items={[]}
        periods={[]}
        profiles={[]}
        filters={{}}
        currentUser={mockAdminUser}
      />,
    );

    expect(screen.getByText('Không có bản nào đang chờ duyệt')).toBeInTheDocument();
  });
});
