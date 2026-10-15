import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PeriodsView } from './PeriodsView';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/admin/periods',
  useSearchParams: () => new URLSearchParams('cycle=2026'),
}));

type PeriodSummary = components['schemas']['PeriodSummary'];
type CycleSummary = components['schemas']['CycleSummary'];

const mockCycles: CycleSummary[] = [
  { year: 2026, status: 'open' },
  { year: 2025, status: 'archived' },
];

const mockPeriods: PeriodSummary[] = [
  {
    key: '2026-10',
    kind: 'month',
    label: 'Tháng 10/2026',
    startsOn: '2026-10-01',
    endsOn: '2026-10-31',
    dueAt: '2026-11-10T23:59:59Z',
    closed: false,
    closedAt: null,
    closedByName: null,
    reopenReason: null,
  },
  {
    key: '2026-Q3',
    kind: 'quarter',
    label: 'Quý 3/2026',
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    dueAt: '2026-10-10T23:59:59Z',
    closed: true,
    closedAt: '2026-10-11T08:00:00Z',
    closedByName: 'Nguyễn Văn Admin',
    reopenReason: 'Bổ sung số liệu kiểm toán',
  },
];

describe('PeriodsView component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders periods table with correct columns and statuses', () => {
    render(
      <PeriodsView
        periods={mockPeriods}
        cycles={mockCycles}
        selectedYear={2026}
      />,
    );

    expect(screen.getByText('Tháng 10/2026')).toBeInTheDocument();
    expect(screen.getByText('2026-10')).toBeInTheDocument();
    expect(screen.getByText('Mở')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /khóa kỳ/i })).toBeInTheDocument();

    expect(screen.getByText('Quý 3/2026')).toBeInTheDocument();
    expect(screen.getByText('2026-Q3')).toBeInTheDocument();
    expect(screen.getByText('Đã khóa')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn Admin')).toBeInTheDocument();
    expect(screen.getByText('Bổ sung số liệu kiểm toán')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mở lại/i })).toBeInTheDocument();
  });

  it('calls ensure endpoint when clicking "Tạo các kỳ còn thiếu"', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue([]);

    render(
      <PeriodsView
        periods={mockPeriods}
        cycles={mockCycles}
        selectedYear={2026}
      />,
    );

    const ensureBtn = screen.getByRole('button', { name: /tạo các kỳ còn thiếu/i });
    fireEvent.click(ensureBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('POST', '/api/cycles/2026/periods/ensure');
    });
  });

  it('creates event period via dialog and POST /api/cycles/2026/periods/events', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({});

    render(
      <PeriodsView
        periods={mockPeriods}
        cycles={mockCycles}
        selectedYear={2026}
      />,
    );

    const openEventBtn = screen.getByRole('button', { name: /tạo kỳ đợt/i });
    fireEvent.click(openEventBtn);

    const dialog = screen.getByRole('dialog', { name: /tạo kỳ báo cáo theo đợt/i });
    expect(dialog).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/nhãn kỳ đợt/i), {
      target: { value: 'Đợt diễn tập ATTT' },
    });
    fireEvent.change(screen.getByLabelText(/ngày bắt đầu/i), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText(/ngày kết thúc/i), {
      target: { value: '2026-11-15' },
    });

    const submitBtn = within(dialog).getByRole('button', { name: /^tạo kỳ đợt$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('POST', '/api/cycles/2026/periods/events', {
        label: 'Đợt diễn tập ATTT',
        startsOn: '2026-11-01',
        endsOn: '2026-11-15',
      });
    });
  });

  it('displays conflict dialog listing pending submissions when closing period fails with INVALID_STATE', async () => {
    vi.spyOn(client, 'apiSend').mockRejectedValue(
      new client.ApiClientError({
        code: 'INVALID_STATE',
        message: 'Kỳ còn bản ghi đang chờ duyệt',
        statusCode: 409,
        details: [
          { kind: 'reading', id: 'sub-read-uuid-1' },
          { kind: 'task_update', id: 'sub-task-uuid-2' },
        ],
      }),
    );

    render(
      <PeriodsView
        periods={mockPeriods}
        cycles={mockCycles}
        selectedYear={2026}
      />,
    );

    // Click Khóa kỳ on row 2026-10
    const closeBtn = screen.getByRole('button', { name: /khóa kỳ/i });
    fireEvent.click(closeBtn);

    // Confirm dialog appears
    const confirmBtn = screen.getByRole('button', { name: /khóa kỳ này/i });
    fireEvent.click(confirmBtn);

    // Conflict dialog appears listing items and link to approvals
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /không thể khóa kỳ báo cáo/i })).toBeInTheDocument();
      expect(screen.getByText(/2 bản ghi đang chờ duyệt/i)).toBeInTheDocument();
      expect(screen.getByText(/sub-read-uuid-1/i)).toBeInTheDocument();
      expect(screen.getByText(/sub-task-uuid-2/i)).toBeInTheDocument();
      const link = screen.getByRole('link', { name: /tới trang chờ duyệt để xử lý/i });
      expect(link).toHaveAttribute('href', '/approvals?period=2026-10');
    });
  });

  it('requires reason when reopening closed period and submits POST reopen', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({});

    render(
      <PeriodsView
        periods={mockPeriods}
        cycles={mockCycles}
        selectedYear={2026}
      />,
    );

    // Click Mở lại on row 2026-Q3
    const reopenBtn = screen.getByRole('button', { name: /mở lại/i });
    fireEvent.click(reopenBtn);

    expect(screen.getByRole('dialog', { name: /mở lại kỳ báo cáo/i })).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /xác nhận mở lại/i });
    expect(submitBtn).toBeDisabled();

    const textarea = screen.getByLabelText(/lý do mở lại kỳ/i);
    fireEvent.change(textarea, { target: { value: 'Điều chỉnh số liệu sau thanh tra' } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/cycles/2026/periods/2026-Q3/reopen',
        { reason: 'Điều chỉnh số liệu sau thanh tra' },
      );
    });
  });
});
