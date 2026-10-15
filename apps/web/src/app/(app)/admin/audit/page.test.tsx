import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

type CurrentUser = components['schemas']['CurrentUser'];
type AuditPage = components['schemas']['AuditPage'];

describe('Admin Audit Page (server component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ForbiddenState for viewer and unit roles', async () => {
    const mockUnitUser: CurrentUser = {
      id: 'u-2',
      email: 'unit@mobifone.vn',
      fullName: 'Nhân viên Đơn vị',
      role: 'unit',
      unit: { code: 'TT1', name: 'Trung tâm 1', kind: 'center' },
      mustChangePassword: false,
    };

    vi.spyOn(client, 'apiGet').mockResolvedValueOnce(mockUnitUser);

    const result = await Page({});
    render(result as React.ReactElement);

    expect(screen.getByText('Truy cập bị từ chối')).toBeInTheDocument();
    expect(screen.getByText(/Bạn không có quyền truy cập trang này/)).toBeInTheDocument();
  });

  it('renders AuditView for admin and ban4 roles', async () => {
    const mockBan4User: CurrentUser = {
      id: 'u-3',
      email: 'ban4@mobifone.vn',
      fullName: 'Cán bộ Ban 4',
      role: 'ban4',
      unit: null,
      mustChangePassword: false,
    };

    const mockAuditPage: AuditPage = {
      items: [],
      nextCursor: null,
    };

    vi.spyOn(client, 'apiGet')
      .mockResolvedValueOnce(mockBan4User)
      .mockResolvedValueOnce(mockAuditPage);

    const result = await Page({});
    render(result as React.ReactElement);

    expect(screen.getByText('Nhật ký hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Không tìm thấy nhật ký')).toBeInTheDocument();
  });
});
