import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskFormDialog } from './TaskFormDialog';
import { TaskSplitDialog } from './TaskSplitDialog';
import { apiSend, ApiClientError } from '@/lib/api/client';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiSend: vi.fn(),
  };
});

describe('Plan 4A W3 Task Dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TaskFormDialog', () => {
    it('creates new task submitting name, unitCode, and dueDate', async () => {
      const onSuccess = vi.fn();
      const onOpenChange = vi.fn();
      vi.mocked(apiSend).mockResolvedValueOnce({ id: 'new-task-id' } as never);

      render(
        <TaskFormDialog
          open={true}
          onOpenChange={onOpenChange}
          riskCode="HD11.R27"
          actionCode="HD11.R27.KH01"
          units={[{ code: 'CNTT', name: 'Ban Công nghệ thông tin' }]}
          onSuccess={onSuccess}
        />,
      );

      expect(screen.getByText(/Thêm đầu việc cho HD11.R27.KH01/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Tên đầu việc/i), {
        target: { value: 'Nâng cấp cụm firewall' },
      });
      fireEvent.change(screen.getByLabelText(/Đơn vị phụ trách/i), {
        target: { value: 'CNTT' },
      });
      fireEvent.change(screen.getByLabelText(/Hạn hoàn thành/i), {
        target: { value: '2026-12-31' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Thêm đầu việc' }));

      await waitFor(() => {
        expect(apiSend).toHaveBeenCalledWith(
          'POST',
          '/api/profiles/HD11.R27/actions/HD11.R27.KH01/tasks',
          {
            name: 'Nâng cấp cụm firewall',
            unitCode: 'CNTT',
            dueDate: '2026-12-31',
          },
        );
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('edits existing task calling PUT /api/tasks/{id}', async () => {
      const onSuccess = vi.fn();
      vi.mocked(apiSend).mockResolvedValueOnce({ id: 'task-1' } as never);

      render(
        <TaskFormDialog
          open={true}
          onOpenChange={vi.fn()}
          riskCode="HD11.R27"
          actionCode="HD11.R27.KH01"
          initialTask={{
            id: 'task-1',
            name: 'Đầu việc cũ',
            unitCode: null,
            dueDate: null,
          }}
          onSuccess={onSuccess}
        />,
      );

      expect(screen.getByText('Sửa đầu việc')).toBeInTheDocument();
      const nameInput = screen.getByLabelText(/Tên đầu việc/i);
      expect(nameInput).toHaveValue('Đầu việc cũ');

      fireEvent.change(nameInput, { target: { value: 'Đầu việc đã cập nhật' } });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(apiSend).toHaveBeenCalledWith(
          'PUT',
          '/api/tasks/task-1',
          {
            name: 'Đầu việc đã cập nhật',
            unitCode: null,
            dueDate: null,
          },
        );
      });
    });
  });

  describe('TaskSplitDialog', () => {
    const mockTask = {
      id: 'task-split-1',
      name: 'Nâng cấp hạ tầng mạng và an toàn',
      sourceText: 'Ghi chú văn bản gốc: Ban CNTT chủ trì phối hợp TT Mạng lưới',
      unit: { code: 'CNTT', name: 'Ban CNTT' },
      dueDate: '2026-12-31',
    };

    it('displays sourceText and starts with 2 parts', () => {
      render(
        <TaskSplitDialog
          open={true}
          onOpenChange={vi.fn()}
          task={mockTask}
          units={[{ code: 'CNTT', name: 'Ban CNTT' }]}
        />,
      );

      expect(screen.getByText(/Ghi chú văn bản gốc/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/Phần 1/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/Phần 2/i)).toBeInTheDocument();
      expect(screen.getByText('Danh sách các phần việc sau khi tách (2/20)')).toBeInTheDocument();
    });

    it('disallows removing parts when parts count is 2 (minimum 2)', () => {
      render(
        <TaskSplitDialog
          open={true}
          onOpenChange={vi.fn()}
          task={mockTask}
          units={[]}
        />,
      );

      const deleteButtons = screen.getAllByTitle(/Cần tối thiểu 2 phần việc/i);
      expect(deleteButtons.length).toBe(2);
      expect(deleteButtons[0]).toBeDisabled();
      expect(deleteButtons[1]).toBeDisabled();
    });

    it('allows adding parts up to 20 and toggles preview table', () => {
      render(
        <TaskSplitDialog
          open={true}
          onOpenChange={vi.fn()}
          task={mockTask}
          units={[{ code: 'CNTT', name: 'Ban CNTT' }]}
        />,
      );

      const addBtn = screen.getByTestId('add-part-button');
      fireEvent.click(addBtn);

      expect(screen.getByText('Danh sách các phần việc sau khi tách (3/20)')).toBeInTheDocument();
      expect(screen.getByDisplayValue(/Phần 3/i)).toBeInTheDocument();

      // Test preview toggle
      const togglePreviewBtn = screen.getByTestId('toggle-preview-button');
      fireEvent.click(togglePreviewBtn);

      expect(screen.getByText(/Bản xem trước \(3 phần việc\)/i)).toBeInTheDocument();
    });

    it('submits split task request with parts payload', async () => {
      const onSuccess = vi.fn();
      const onOpenChange = vi.fn();
      vi.mocked(apiSend).mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }] as never);

      render(
        <TaskSplitDialog
          open={true}
          onOpenChange={onOpenChange}
          task={mockTask}
          units={[{ code: 'CNTT', name: 'Ban CNTT' }]}
          onSuccess={onSuccess}
        />,
      );

      const confirmBtn = screen.getByTestId('confirm-split-button');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(apiSend).toHaveBeenCalledWith(
          'POST',
          '/api/tasks/task-split-1/split',
          {
            parts: [
              {
                name: 'Nâng cấp hạ tầng mạng và an toàn (Phần 1)',
                unitCode: 'CNTT',
                dueDate: '2026-12-31',
              },
              {
                name: 'Nâng cấp hạ tầng mạng và an toàn (Phần 2)',
                unitCode: 'CNTT',
                dueDate: '2026-12-31',
              },
            ],
          },
        );
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('handles INVALID_STATE error displaying friendly rejection message', async () => {
      const error = new ApiClientError({
        code: 'INVALID_STATE',
        message: 'Không thể tách',
        statusCode: 409,
      });
      vi.mocked(apiSend).mockRejectedValueOnce(error);

      render(
        <TaskSplitDialog
          open={true}
          onOpenChange={vi.fn()}
          task={mockTask}
          units={[]}
        />,
      );

      const confirmBtn = screen.getByTestId('confirm-split-button');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText(/Không thể tách đầu việc do đầu việc đã có số liệu duyệt/i)).toBeInTheDocument();
      });
    });
  });
});
