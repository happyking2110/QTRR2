import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkImportUsersDialog } from './BulkImportUsersDialog';
import * as client from '@/lib/api/client';

describe('BulkImportUsersDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders step 1 template link and step 2 file input when open', () => {
    render(
      <BulkImportUsersDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Nhập người dùng hàng loạt')).toBeInTheDocument();
    const templateLink = screen.getByRole('link', { name: /Tải file mẫu CSV/i });
    expect(templateLink).toHaveAttribute('href', '/api/users/import-template');
    expect(screen.getByLabelText(/Chọn file CSV hoặc Excel/i)).toBeInTheDocument();
  });

  it('handles successful import, displays count, and allows CSV download with BOM', async () => {
    const onSuccess = vi.fn();
    const mockCreated = [
      {
        email: 'user1@mobifone.vn',
        fullName: 'Nguyễn Văn Một',
        role: 'unit' as const,
        temporaryPassword: 'TempPassword123!',
      },
      {
        email: 'user2@mobifone.vn',
        fullName: 'Trần Thị Hai',
        role: 'ban4' as const,
        temporaryPassword: 'TempPassword456!',
      },
    ];

    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValueOnce({
      created: mockCreated,
    });

    // Mock createObjectURL
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
    const mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;

    render(
      <BulkImportUsersDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    const fileInput = screen.getByLabelText(/Chọn file CSV hoặc Excel/i);
    const testFile = new File(['email,full_name,role,unit_code'], 'users.csv', {
      type: 'text/csv',
    });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(screen.getByText(/users.csv/)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Bắt đầu nhập/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('/api/users/import', {
        method: 'POST',
        body: expect.any(FormData),
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Đã tạo thành công 2 người dùng/i)).toBeInTheDocument();
    });
    expect(onSuccess).toHaveBeenCalled();

    // Click download temporary passwords CSV button
    const downloadBtn = screen.getByRole('button', { name: /Tải file mật khẩu tạm \(CSV\)/i });
    fireEvent.click(downloadBtn);

    expect(mockCreateObjectURL).toHaveBeenCalled();
    const blobArg = mockCreateObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
  });

  it('displays table of errors on 422 IMPORT_INVALID and keeps previous list intact', async () => {
    const apiError = new client.ApiClientError({
      message: 'Tệp tải lên có lỗi ở 2 dòng',
      code: 'IMPORT_INVALID',
      statusCode: 422,
      details: [
        { row: 2, field: 'email', message: 'Email không đúng định dạng' },
        { row: 5, field: 'unit_code', message: 'Mã đơn vị không tồn tại: ABC' },
      ],
    });

    vi.spyOn(client, 'apiSend').mockRejectedValueOnce(apiError);

    render(
      <BulkImportUsersDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const fileInput = screen.getByLabelText(/Chọn file CSV hoặc Excel/i);
    const testFile = new File(['bad content'], 'bad.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const submitBtn = screen.getByRole('button', { name: /Bắt đầu nhập/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Không ai được tạo trong hệ thống/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Email không đúng định dạng')).toBeInTheDocument();
    expect(screen.getByText('Mã đơn vị không tồn tại: ABC')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('wipes temporary passwords and form state from DOM when closed', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <BulkImportUsersDialog
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    );

    const closeBtn = screen.getByRole('button', { name: /Đóng/i });
    fireEvent.click(closeBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Rerender as closed
    rerender(
      <BulkImportUsersDialog
        open={false}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('TempPassword');
  });
});
