import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AuditView } from './AuditView';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

type AuditEntry = components['schemas']['AuditEntry'];
type CurrentUser = components['schemas']['CurrentUser'];

const mockAdminUser: CurrentUser = {
  id: 'u-1',
  email: 'admin@mobifone.vn',
  fullName: 'Quản trị viên',
  role: 'admin',
  unit: null,
  mustChangePassword: false,
};

const mockEntries: AuditEntry[] = [
  {
    id: '10',
    at: '2026-10-13T10:30:00Z',
    user: {
      fullName: 'Trần Thị B',
      email: 'ttb@mobifone.vn',
    },
    action: 'approve_submission',
    entity: 'indicator_reading',
    entityId: 'r-101',
    before: {
      status: 'pending',
      note: 'Ghi chú ban đầu',
    },
    after: {
      status: 'approved',
      note: 'Ghi chú ban đầu',
    },
    ip: '10.0.0.1',
  },
  {
    id: '9',
    at: '2026-10-13T09:15:00Z',
    user: null, // Hệ thống
    action: 'close_period',
    entity: 'period',
    entityId: '2026-09',
    before: {
      closed: false,
      closedAt: null,
    },
    after: {
      closed: true,
      closedAt: '2026-10-13T09:15:00Z',
    },
    ip: null,
  },
  {
    id: '8',
    at: '2026-10-13T08:00:00Z',
    user: {
      fullName: 'Lê Văn C',
      email: 'lvc@mobifone.vn',
    },
    action: 'submit_reading',
    entity: 'indicator_reading',
    entityId: 'r-100',
    before: null, // Created new
    after: {
      valueText: '7.5%',
      zone: 'yellow',
    },
    ip: '192.168.1.10',
  },
  {
    id: '7',
    at: '2026-10-12T17:00:00Z',
    user: {
      fullName: 'Quản trị viên',
      email: 'admin@mobifone.vn',
    },
    action: 'custom_unknown_action', // Tên lạ hiện nguyên văn
    entity: 'test_entity',
    entityId: 't-1',
    before: {
      isActive: true,
    },
    after: null, // Deleted
    ip: '127.0.0.1',
  },
];

describe('AuditView component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders table with Vietnamese formatted datetime, "Hệ thống" for null user, and translated action labels', () => {
    render(
      <AuditView
        initialData={{ items: mockEntries, nextCursor: null }}
        initialFilters={{ actor: '', entity: '', action: '', from: '', to: '' }}
        currentUser={mockAdminUser}
      />,
    );

    // Header title
    expect(screen.getByText('Nhật ký hoạt động')).toBeInTheDocument();

    // Row 10: Tran Thi B, Duyệt bản nộp
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument();
    expect(screen.getByText('ttb@mobifone.vn')).toBeInTheDocument();
    expect(screen.getByText('Duyệt bản nộp')).toBeInTheDocument();
    expect(screen.getAllByText('indicator_reading').length).toBeGreaterThan(0);

    // Row 9: user is null -> "Hệ thống", Khóa kỳ báo cáo
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Khóa kỳ báo cáo')).toBeInTheDocument();
    expect(screen.getByText('period')).toBeInTheDocument();

    // Row 7: custom_unknown_action -> displays raw string as required ("tên lạ hiện nguyên văn")
    expect(screen.getAllByText('custom_unknown_action').length).toBeGreaterThan(0);
  });

  it('phân trang nối tiếp không trùng: tải thêm nối các bản ghi và lọc trùng', async () => {
    // Initial data: item 10 and item 9, nextCursor: '9'
    const initialItems = [mockEntries[0], mockEntries[1]];

    // Next page returns item 9 (duplicate) and item 8, nextCursor: null
    const secondPageItems = [mockEntries[1], mockEntries[2]];

    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValueOnce({
      items: secondPageItems,
      nextCursor: null,
    });

    render(
      <AuditView
        initialData={{ items: initialItems, nextCursor: '9' }}
        initialFilters={{ actor: '', entity: '', action: '', from: '', to: '' }}
        currentUser={mockAdminUser}
      />,
    );

    // Currently showing 2 records
    expect(screen.getByTestId('audit-count')).toHaveTextContent('Hiển thị 2 bản ghi');
    const loadMoreBtn = screen.getByTestId('load-more-btn');
    expect(loadMoreBtn).toBeInTheDocument();

    // Click "Tải thêm"
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith('GET', expect.stringContaining('/api/audit?cursor=9'));
    });

    // Should now show 3 unique records (10, 9, 8) without duplicating item 9
    await waitFor(() => {
      expect(screen.getByTestId('audit-count')).toHaveTextContent('Hiển thị 3 bản ghi');
    });

    // Item 8 is now in document
    expect(screen.getByText('Nộp số liệu chỉ số')).toBeInTheDocument();

    // Load more button should be gone since nextCursor is null
    expect(screen.queryByTestId('load-more-btn')).not.toBeInTheDocument();
    expect(screen.getByText('Đã hiển thị tất cả nhật ký')).toBeInTheDocument();
  });

  it('so sánh trước/sau tô đúng trường: trường đổi có đánh dấu thay đổi, trường không đổi không tô', async () => {
    render(
      <AuditView
        initialData={{ items: mockEntries, nextCursor: null }}
        initialFilters={{ actor: '', entity: '', action: '', from: '', to: '' }}
        currentUser={mockAdminUser}
      />,
    );

    // Click on row 10 (status changed from pending -> approved, note stayed same)
    const row10 = screen.getByTestId('audit-row-10');
    fireEvent.click(row10);

    // Diff drawer is open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Chi tiết nhật ký hoạt động')).toBeInTheDocument();

    // Check diff table
    const diffTable = screen.getByTestId('diff-table');
    expect(diffTable).toBeInTheDocument();

    // Row 'status': changed from pending to approved
    const statusRow = screen.getByTestId('diff-row-status');
    expect(statusRow).toHaveAttribute('data-changed', 'true');
    expect(within(statusRow).getByTestId('diff-before-status')).toHaveTextContent('pending');
    expect(within(statusRow).getByTestId('diff-after-status')).toHaveTextContent('approved');
    expect(within(statusRow).getByText('Đổi')).toBeInTheDocument();

    // Row 'note': stayed same ("Ghi chú ban đầu")
    const noteRow = screen.getByTestId('diff-row-note');
    expect(noteRow).toHaveAttribute('data-changed', 'false');
    expect(within(noteRow).getByTestId('diff-before-note')).toHaveTextContent('Ghi chú ban đầu');
    expect(within(noteRow).getByTestId('diff-after-note')).toHaveTextContent('Ghi chú ban đầu');

    // Close button
    const closeBtn = screen.getByTestId('drawer-close-btn');
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('before hoặc after null hiện "—"', async () => {
    render(
      <AuditView
        initialData={{ items: mockEntries, nextCursor: null }}
        initialFilters={{ actor: '', entity: '', action: '', from: '', to: '' }}
        currentUser={mockAdminUser}
      />,
    );

    // 1. Entry 8 has before: null (creation)
    const row8 = screen.getByTestId('audit-row-8');
    fireEvent.click(row8);

    expect(screen.getByText(/Tạo mới \(trước: —\)/)).toBeInTheDocument();
    const valTextBefore = screen.getByTestId('diff-before-valueText');
    expect(valTextBefore).toHaveTextContent('—');
    const valTextAfter = screen.getByTestId('diff-after-valueText');
    expect(valTextAfter).toHaveTextContent('7.5%');

    // Close drawer via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // 2. Entry 7 has after: null (deletion)
    const row7 = screen.getByTestId('audit-row-7');
    fireEvent.click(row7);

    expect(screen.getByText(/Đã xóa \(sau: —\)/)).toBeInTheDocument();
    const isActiveBefore = screen.getByTestId('diff-before-isActive');
    expect(isActiveBefore).toHaveTextContent('true');
    const isActiveAfter = screen.getByTestId('diff-after-isActive');
    expect(isActiveAfter).toHaveTextContent('—');
  });

  it('submitting filters updates search and calls apiSend with parameters', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValueOnce({
      items: [mockEntries[0]],
      nextCursor: null,
    });

    render(
      <AuditView
        initialData={{ items: mockEntries, nextCursor: null }}
        initialFilters={{ actor: '', entity: '', action: '', from: '', to: '' }}
        currentUser={mockAdminUser}
      />,
    );

    // Enter actor filter
    const actorInput = screen.getByLabelText(/Người thực hiện/);
    fireEvent.change(actorInput, { target: { value: 'ttb' } });

    // Submit filter form
    const submitBtn = screen.getByRole('button', { name: /Áp dụng lọc/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('/api/audit?actor=ttb'),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('audit-count')).toHaveTextContent('Hiển thị 1 bản ghi');
    });
  });
});
