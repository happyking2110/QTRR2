import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CyclesView } from './CyclesView';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type CycleSummary = components['schemas']['CycleSummary'];

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: vi.fn(),
  }),
}));

describe('CyclesView', () => {
  const mockCycles: CycleSummary[] = [
    { year: 2026, status: 'open' },
    { year: 2025, status: 'archived' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders list of cycles with status and action buttons', () => {
    render(<CyclesView cycles={mockCycles} />);

    expect(screen.getByText('Quản lý chu kỳ đánh giá')).toBeDefined();
    expect(screen.getAllByText('Chu kỳ 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chu kỳ 2025').length).toBeGreaterThan(0);

    expect(screen.getAllByText('Đang mở').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đã lưu trữ').length).toBeGreaterThan(0);

    // 2026 is open, so it has "Lưu trữ" button; 2025 is archived so it shows "Chỉ đọc"
    expect(screen.getAllByTitle('Lưu trữ chu kỳ 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chỉ đọc').length).toBeGreaterThan(0);
  });

  it('renders mobile card layout for small screens without requiring horizontal scroll (S7)', () => {
    render(<CyclesView cycles={mockCycles} />);

    const mobileCards = screen.getByTestId('cycles-mobile-cards');
    expect(mobileCards).toBeDefined();

    // Mobile cards must display the cycle year, status, and direct archive button
    expect(mobileCards.textContent).toContain('Chu kỳ 2026');
    expect(mobileCards.textContent).toContain('Đang mở');
    expect(mobileCards.textContent).toContain('Lưu trữ');
    expect(mobileCards.textContent).toContain('Chu kỳ 2025');
    expect(mobileCards.textContent).toContain('Đã lưu trữ');
  });

  it('opens ConfirmDialog and archives cycle on confirm', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValueOnce(undefined as never);

    render(<CyclesView cycles={mockCycles} />);

    const archiveBtn = screen.getAllByTitle('Lưu trữ chu kỳ 2026')[0];
    fireEvent.click(archiveBtn);

    // Confirm dialog appears
    expect(screen.getByText('Lưu trữ chu kỳ 2026')).toBeDefined();
    expect(
      screen.getByText(/Sau khi lưu trữ, chu kỳ sẽ chuyển sang chế độ/),
    ).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận lưu trữ' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('POST', '/api/cycles/2026/archive');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('displays error and /approvals link when archive fails with INVALID_STATE', async () => {
    vi.spyOn(client, 'apiSend').mockRejectedValueOnce(
      new client.ApiClientError({
        code: 'INVALID_STATE',
        statusCode: 409,
        message: 'Còn 3 bản ghi đang chờ phê duyệt trong chu kỳ 2026.',
      }),
    );

    render(<CyclesView cycles={mockCycles} />);

    const archiveBtn = screen.getAllByTitle('Lưu trữ chu kỳ 2026')[0];
    fireEvent.click(archiveBtn);

    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận lưu trữ' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(
        screen.getByText('Còn 3 bản ghi đang chờ phê duyệt trong chu kỳ 2026.'),
      ).toBeDefined();
      const link = screen.getByRole('link', {
        name: /Đi đến trang Chờ duyệt để xử lý bản nộp/i,
      });
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toBe('/approvals');
    });
  });

  it('handles clone cycle submission and displays clone result report', async () => {
    const cloneReport = {
      year: 2027,
      counts: {
        profiles: 4,
        causes: 16,
        impacts: 15,
        controls: 17,
        actions: 10,
        tasksCreated: 10,
        kri: 9,
        kci: 12,
        periodsCreated: 4,
      },
      issues: [],
    };

    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValueOnce(cloneReport as never);

    render(<CyclesView cycles={mockCycles} />);

    // Click "Nhân bản" on cycle 2026
    const cloneBtn = screen.getAllByTitle('Nhân bản từ chu kỳ 2026')[0];
    fireEvent.click(cloneBtn);

    expect(screen.getByText('Tạo chu kỳ năm mới bằng cách sao chép hồ sơ, mục con, liên kết và gán đơn vị từ chu kỳ cũ.')).toBeDefined();

    // Target year defaults to 2027
    const submitBtn = screen.getByRole('button', { name: 'Bắt đầu nhân bản' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('POST', '/api/cycles/2027/clone', {
        fromYear: 2026,
      });
      expect(screen.getByText('Nhân bản thành công sang chu kỳ 2027!')).toBeDefined();
      expect(screen.getByText('Kết quả nhân bản')).toBeDefined();
      expect(screen.getByText('4')).toBeDefined();
      expect(screen.getByText('16')).toBeDefined();
    });
  });

  it('imports cycle file and shows report with counts and warning issues', async () => {
    const importReport = {
      year: 2026,
      counts: {
        profiles: 4,
        causes: 16,
        impacts: 15,
        controls: 17,
        actions: 10,
        tasksCreated: 10,
        kri: 9,
        kci: 12,
        periodsCreated: 4,
      },
      issues: [
        {
          code: 'LINK_ONE_SIDED',
          ref: 'HD11.R27.KS01',
          message: 'Liên kết một chiều chưa đối ứng',
          level: 'warning',
        },
      ],
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => importReport,
    } as unknown as Response);

    render(<CyclesView cycles={mockCycles} />);

    const openImportBtn = screen.getByRole('button', { name: /Import chu kỳ/i });
    fireEvent.click(openImportBtn);

    expect(screen.getByText('Import chu kỳ từ tệp Excel')).toBeDefined();
    const fileInput = screen.getByLabelText(/Chọn tệp Excel/i);
    const dummyFile = new File(['dummy content'], 'RRTY2026.MBF.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(fileInput, { target: { files: [dummyFile] } });

    const form = document.getElementById('import-cycle-form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/cycles/import', expect.any(Object));
      expect(screen.getByText('Import chu kỳ 2026 thành công!')).toBeDefined();
      expect(screen.getByText('Báo cáo số đếm import')).toBeDefined();
      expect(screen.getByText('Cảnh báo dữ liệu (1)')).toBeDefined();
      expect(screen.getByText('LINK_ONE_SIDED')).toBeDefined();
      expect(screen.getByText('HD11.R27.KS01')).toBeDefined();
    });
  });

  it('displays blocking issue table on 422 IMPORT_INVALID', async () => {
    const invalidResponse = {
      code: 'IMPORT_INVALID',
      message: 'Dữ liệu tệp không hợp lệ.',
      details: {
        issues: [
          {
            code: 'DUPLICATE_CODE',
            ref: 'HD11.R27.NN01',
            message: 'Trùng mã nguyên nhân',
            level: 'error',
          },
          {
            code: 'BAD_REFERENCE',
            ref: 'HD11.R27.KS99',
            message: 'Tham chiếu không tồn tại',
            level: 'error',
          },
        ],
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => invalidResponse,
    } as unknown as Response);

    render(<CyclesView cycles={mockCycles} />);

    const openImportBtn = screen.getByRole('button', { name: /Import chu kỳ/i });
    fireEvent.click(openImportBtn);

    const fileInput = screen.getByLabelText(/Chọn tệp Excel/i);
    const dummyFile = new File(['dummy content'], 'invalid.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(fileInput, { target: { files: [dummyFile] } });

    const form = document.getElementById('import-cycle-form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Dữ liệu tệp không hợp lệ \(2 vấn đề cần sửa trước\)/i)).toBeDefined();
      expect(screen.getByText('DUPLICATE_CODE')).toBeDefined();
      expect(screen.getByText('HD11.R27.NN01')).toBeDefined();
      expect(screen.getByText('Trùng mã nguyên nhân')).toBeDefined();
      expect(screen.getByText('BAD_REFERENCE')).toBeDefined();
    });
  });
});
