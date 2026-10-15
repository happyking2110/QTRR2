import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskUpdateForm, type TaskUpdateFormTask } from './TaskUpdateForm';
import * as client from '@/lib/api/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockTask: TaskUpdateFormTask = {
  id: 'task-1',
  name: 'Nâng cấp hệ thống giám sát tải mạng',
  actionCode: 'HD11.R27.A01',
  progress: 60,
  submitPeriodKeys: ['2026-Q3', '2026-Q4'],
  pendingSubmissions: [],
};

describe('TaskUpdateForm component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders period select strictly matching submitPeriodKeys', () => {
    render(
      <TaskUpdateForm
        task={mockTask}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const periodSelect = screen.getByLabelText(/kỳ báo cáo/i) as HTMLSelectElement;
    expect(periodSelect).toBeInTheDocument();
    expect(periodSelect.options).toHaveLength(2);
    expect(periodSelect.options[0].value).toBe('2026-Q3');
    expect(periodSelect.options[1].value).toBe('2026-Q4');
  });

  it('synchronizes range slider, number input, and preset buttons', () => {
    render(
      <TaskUpdateForm
        task={mockTask}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const slider = screen.getByLabelText(/thanh kéo điều chỉnh tiến độ/i) as HTMLInputElement;
    const numberInput = screen.getByLabelText(/tiến độ hoàn thành/i) as HTMLInputElement;

    // Initial value is task.progress = 60
    expect(slider.value).toBe('60');
    expect(numberInput.value).toBe('60');

    // Change slider to 75
    fireEvent.change(slider, { target: { value: '75' } });
    expect(slider.value).toBe('75');
    expect(numberInput.value).toBe('75');

    // Change number input to 80
    fireEvent.change(numberInput, { target: { value: '80' } });
    expect(slider.value).toBe('80');
    expect(numberInput.value).toBe('80');

    // Click preset button 100%
    const preset100 = screen.getByRole('button', { name: '100%' });
    fireEvent.click(preset100);
    expect(slider.value).toBe('100');
    expect(numberInput.value).toBe('100');
  });

  it('requires note and shows warning banner when progress is decreased below current progress', async () => {
    render(
      <TaskUpdateForm
        task={mockTask}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const numberInput = screen.getByLabelText(/tiến độ hoàn thành/i);
    // Lower progress from 60 to 45
    fireEvent.change(numberInput, { target: { value: '45' } });

    // Warning message should be visible
    expect(
      screen.getByText(/tiến độ thấp hơn bản đã duyệt \(60%\), vui lòng ghi rõ lý do/i),
    ).toBeInTheDocument();

    // Submit button
    const submitBtn = screen.getByRole('button', { name: /nộp để duyệt/i });
    fireEvent.click(submitBtn);

    // Validation error should trigger
    await waitFor(() => {
      expect(
        screen.getByText('Tiến độ thấp hơn bản đã duyệt (60%), vui lòng ghi rõ lý do.'),
      ).toBeInTheDocument();
    });
  });

  it('successfully submits POST /api/tasks/{id}/updates', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({
      id: 'sub-new',
      taskId: 'task-1',
      periodKey: '2026-Q3',
      progress: 75,
      status: 'pending',
    });
    const onSuccess = vi.fn();

    render(
      <TaskUpdateForm
        task={mockTask}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    const numberInput = screen.getByLabelText(/tiến độ hoàn thành/i);
    fireEvent.change(numberInput, { target: { value: '75' } });

    const noteInput = screen.getByLabelText(/ghi chú/i);
    fireEvent.change(noteInput, { target: { value: 'Đã hoàn thành thử nghiệm đợt 1' } });

    const submitBtn = screen.getByRole('button', { name: /nộp để duyệt/i });
    fireEvent.click(submitBtn);

    await waitFor(
      () => {
        expect(apiSendSpy).toHaveBeenCalledWith('POST', '/api/tasks/task-1/updates', {
          periodKey: '2026-Q3',
          progress: 75,
          note: 'Đã hoàn thành thử nghiệm đợt 1',
        });
        expect(screen.getByText('Đã gửi, đang chờ duyệt')).toBeInTheDocument();
        expect(onSuccess).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it('displays PERIOD_CLOSED banner when server returns PERIOD_CLOSED', async () => {
    vi.spyOn(client, 'apiSend').mockRejectedValue(
      new client.ApiClientError({
        code: 'PERIOD_CLOSED',
        message: 'Kỳ 2026-Q3 đã bị đóng',
        statusCode: 409,
      }),
    );

    render(
      <TaskUpdateForm
        task={mockTask}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /nộp để duyệt/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Kỳ báo cáo đã đóng, không thể sửa đổi số liệu.')).toBeInTheDocument();
    });
  });

  it('binds fieldErrors from server validation error', async () => {
    vi.spyOn(client, 'apiSend').mockRejectedValue(
      new client.ApiClientError({
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        statusCode: 422,
        fieldErrors: {
          note: 'Ghi chú không được chứa ký tự đặc biệt nguy hiểm',
        },
      }),
    );

    render(
      <TaskUpdateForm
        task={mockTask}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /nộp để duyệt/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Ghi chú không được chứa ký tự đặc biệt nguy hiểm'),
      ).toBeInTheDocument();
    });
  });

  it('warns when pending submission exists for selected period and allows withdraw', async () => {
    const taskWithPending: TaskUpdateFormTask = {
      ...mockTask,
      pendingSubmissions: [
        {
          id: 'pending-sub-1',
          periodKey: '2026-Q3',
          submittedAt: '2026-10-10T10:00:00Z',
          submittedByName: 'Nguyễn Văn A',
          canWithdraw: true,
        },
      ],
    };

    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({});

    render(
      <TaskUpdateForm
        task={taskWithPending}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/đang có một bản chờ duyệt cho kỳ này/i),
    ).toBeInTheDocument();

    const withdrawBtn = screen.getByRole('button', { name: /rút bản cũ/i });
    expect(withdrawBtn).toBeInTheDocument();

    fireEvent.click(withdrawBtn);

    // Confirm dialog appears
    const confirmBtn = screen.getByRole('button', { name: /^rút lại$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/task-updates/pending-sub-1/withdraw',
      );
    });
  });
});
