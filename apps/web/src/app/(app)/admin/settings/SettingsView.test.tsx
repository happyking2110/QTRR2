import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsView } from './SettingsView';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

type Settings = components['schemas']['Settings'];

const mockInitialSettings: Settings = {
  slowDays: 60,
  slowProgress: 70,
  staleDays: 90,
  dueDay: 10,
};

describe('SettingsView component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial settings inputs with correct values and warning note', () => {
    render(<SettingsView initialSettings={mockInitialSettings} />);

    expect(screen.getByLabelText(/số ngày cảnh báo nguy cơ chậm/i)).toHaveValue(60);
    expect(screen.getByLabelText(/tiến độ tối thiểu/i)).toHaveValue(70);
    expect(screen.getByLabelText(/số ngày không cập nhật/i)).toHaveValue(90);
    expect(screen.getByLabelText(/ngày hạn nhập mỗi tháng/i)).toHaveValue(10);

    expect(
      screen.getByText(/thay đổi ngày hạn nhập chỉ áp dụng cho các kỳ báo cáo được tạo sau khi đổi cấu hình/i),
    ).toBeInTheDocument();
  });

  it('displays field errors when inputs are outside valid ranges and prevents submit', async () => {
    render(<SettingsView initialSettings={mockInitialSettings} />);

    // Set invalid values
    fireEvent.change(screen.getByLabelText(/số ngày cảnh báo nguy cơ chậm/i), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText(/tiến độ tối thiểu/i), {
      target: { value: '150' },
    });
    fireEvent.change(screen.getByLabelText(/số ngày không cập nhật/i), {
      target: { value: '400' },
    });
    fireEvent.change(screen.getByLabelText(/ngày hạn nhập mỗi tháng/i), {
      target: { value: '31' },
    });

    const saveBtn = screen.getByRole('button', { name: /lưu cấu hình/i });
    fireEvent.click(saveBtn);

    // Confirmation dialog should NOT appear
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Check individual field errors
    expect(
      screen.getByText('Số ngày cảnh báo nguy cơ chậm phải là số nguyên từ 1 đến 365 ngày.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tiến độ tối thiểu phải là số nguyên từ 0 đến 100%.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Số ngày không cập nhật phải là số nguyên từ 1 đến 365 ngày.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ngày hạn nhập mỗi tháng phải là số nguyên từ ngày 1 đến 28.'),
    ).toBeInTheDocument();
  });

  it('submits PUT /api/settings with confirmation dialog when valid', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({
      slowDays: 45,
      slowProgress: 75,
      staleDays: 60,
      dueDay: 15,
    });

    render(<SettingsView initialSettings={mockInitialSettings} />);

    fireEvent.change(screen.getByLabelText(/số ngày cảnh báo nguy cơ chậm/i), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText(/tiến độ tối thiểu/i), {
      target: { value: '75' },
    });
    fireEvent.change(screen.getByLabelText(/số ngày không cập nhật/i), {
      target: { value: '60' },
    });
    fireEvent.change(screen.getByLabelText(/ngày hạn nhập mỗi tháng/i), {
      target: { value: '15' },
    });

    const saveBtn = screen.getByRole('button', { name: /lưu cấu hình/i });
    fireEvent.click(saveBtn);

    // Confirmation dialog appears
    expect(screen.getByRole('alertdialog', { name: /xác nhận lưu thay đổi cấu hình/i })).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /xác nhận lưu/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('PUT', '/api/settings', {
        slowDays: 45,
        slowProgress: 75,
        staleDays: 60,
        dueDay: 15,
      });
      expect(screen.getByText('Đã lưu thành công cấu hình hệ thống.')).toBeInTheDocument();
    });
  });

  it('binds fieldErrors from server validation response', async () => {
    vi.spyOn(client, 'apiSend').mockRejectedValue(
      new client.ApiClientError({
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        statusCode: 422,
        fieldErrors: {
          dueDay: 'Ngày hạn nhập phải trước ngày 28 hàng tháng',
        },
      }),
    );

    render(<SettingsView initialSettings={mockInitialSettings} />);

    fireEvent.change(screen.getByLabelText(/ngày hạn nhập mỗi tháng/i), {
      target: { value: '25' },
    });

    const saveBtn = screen.getByRole('button', { name: /lưu cấu hình/i });
    fireEvent.click(saveBtn);

    const confirmBtn = screen.getByRole('button', { name: /xác nhận lưu/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Ngày hạn nhập phải trước ngày 28 hàng tháng'),
      ).toBeInTheDocument();
    });
  });
});
