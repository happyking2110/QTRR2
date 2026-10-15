import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AssignmentsView } from './AssignmentsView';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type Assignments = components['schemas']['Assignments'];
type ProfileSummary = components['schemas']['ProfileSummary'];
type UnitSummary = components['schemas']['UnitSummary'];
type CycleSummary = components['schemas']['CycleSummary'];
type CurrentUser = components['schemas']['CurrentUser'];

// Mock Next.js navigation
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/admin/assignments',
}));

describe('AssignmentsView', () => {
  const mockProfiles = [
    {
      code: 'RRTY_HD11_01',
      riskCode: 'HD11-R27',
      name: 'Rủi ro rò rỉ dữ liệu khách hàng',
      levelLabel: 'Cao',
      inherentScore: 16,
      residualScore: 12,
      targetScore: 8,
      indicatorCount: 2,
      actionCount: 3,
    },
    {
      code: 'RRTY_HD11_02',
      riskCode: 'HD11-R28',
      name: 'Rủi ro gián đoạn mạng lõi',
      levelLabel: 'Trung bình',
      inherentScore: 12,
      residualScore: 9,
      targetScore: 6,
      indicatorCount: 1,
      actionCount: 1,
    },
  ] as unknown as ProfileSummary[];

  const mockUnits: UnitSummary[] = [
    { code: 'BAN_CNTT', name: 'Ban Công nghệ Thông tin', kind: 'department' },
    { code: 'TT_KD', name: 'Trung tâm Kinh doanh', kind: 'center' },
    { code: 'BAN_KT', name: 'Ban Kỹ thuật', kind: 'department' },
  ];

  const mockCycles: CycleSummary[] = [
    { year: 2026, status: 'open' },
    { year: 2025, status: 'archived' },
  ];

  const mockAssignments: Assignments = {
    riskCode: 'HD11-R27',
    controls: [
      {
        code: 'KS-01',
        description: 'Kiểm soát truy cập đặc quyền máy chủ cơ sở dữ liệu',
        ownerText: 'Ban CNTT & Trung tâm An ninh mạng MBF',
        units: [mockUnits[0]],
      },
      {
        code: 'KS-02',
        description: 'Mã hóa dữ liệu tại chỗ (TDE)',
        ownerText: 'Phòng Kỹ thuật hệ thống',
        units: [], // unassigned
      },
    ],
    indicators: [
      {
        code: 'KRI-01',
        kind: 'kri',
        name: 'Số sự cố bảo mật dữ liệu mức độ nghiêm trọng',
        ownerUnit: mockUnits[0],
      },
      {
        code: 'KCI-01',
        kind: 'kci',
        name: 'Tỷ lệ máy chủ tuân thủ chính sách mật khẩu',
        ownerUnit: null, // unassigned
      },
    ],
    tasks: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        actionCode: 'KH-01',
        name: 'Triển khai giải pháp DLP cho toàn tổng công ty',
        responsibilityText: 'Ban CNTT chủ trì, các Trung tâm phối hợp thực hiện',
        unit: mockUnits[0],
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        actionCode: 'KH-02',
        name: 'Đánh giá an ninh mạng định kỳ quý',
        responsibilityText: 'Trung tâm Kinh doanh phối hợp',
        unit: null, // unassigned
      },
    ],
  };

  const adminUser: CurrentUser = {
    id: 'user-admin',
    email: 'admin@mobifone.vn',
    fullName: 'Admin Hệ Thống',
    role: 'admin',
    unit: null,
    mustChangePassword: false,
  };

  const ban4User: CurrentUser = {
    id: 'user-ban4',
    email: 'ban4@mobifone.vn',
    fullName: 'Chuyên viên Ban 4',
    role: 'ban4',
    unit: null,
    mustChangePassword: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockReplace.mockReset();
    mockSearchParams = new URLSearchParams({
      profile: 'HD11-R27',
      cycle: '2026',
    });
  });

  it('renders profile selector and 3 tables with verbatim Excel texts', () => {
    render(
      <AssignmentsView
        profiles={mockProfiles}
        units={mockUnits}
        cycles={mockCycles}
        initialAssignments={mockAssignments}
        currentUser={adminUser}
      />,
    );

    // Profile selector
    expect(screen.getByLabelText(/Chọn hồ sơ rủi ro/i)).toBeInTheDocument();

    // Verbatim text in controls table
    expect(
      screen.getByText('Ban CNTT & Trung tâm An ninh mạng MBF'),
    ).toBeInTheDocument();
    expect(screen.getByText('Phòng Kỹ thuật hệ thống')).toBeInTheDocument();

    // Verbatim text in tasks table
    expect(
      screen.getByText('Ban CNTT chủ trì, các Trung tâm phối hợp thực hiện'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Trung tâm Kinh doanh phối hợp'),
    ).toBeInTheDocument();

    // Prominent unassigned badges
    expect(screen.getAllByText('Chưa gán: 1').length).toBeGreaterThan(0);
  });

  it('allows admin to save control assignments with multiple units', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValueOnce([
      mockUnits[0],
      mockUnits[1],
    ]);

    render(
      <AssignmentsView
        profiles={mockProfiles}
        units={mockUnits}
        cycles={mockCycles}
        initialAssignments={mockAssignments}
        currentUser={adminUser}
      />,
    );

    // Click dropdown for KS-01
    const dropdownBtn = screen.getByLabelText('Chọn đơn vị cho kiểm soát KS-01');
    fireEvent.click(dropdownBtn);

    // Toggle unit TT_KD (Trung tâm Kinh doanh)
    const unitOption = screen.getByRole('button', { name: /Trung tâm Kinh doanh/i });
    fireEvent.click(unitOption);

    // Find Save button for KS-01 in its row
    const controlRow = screen.getByText('KS-01').closest('tr')!;
    const saveBtn = within(controlRow).getByRole('button', { name: 'Lưu đơn vị cho KS-01' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        '/api/profiles/HD11-R27/controls/KS-01/units?cycle=2026',
        {
          method: 'PUT',
          body: {
            unitCodes: expect.arrayContaining(['BAN_CNTT', 'TT_KD']),
          },
        },
      );
    });

    await waitFor(() => {
      expect(within(controlRow).getByText('Đã lưu')).toBeInTheDocument();
    });
  });

  it('allows saving single unit for an indicator', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValueOnce({
      ownerUnit: mockUnits[1],
    });

    render(
      <AssignmentsView
        profiles={mockProfiles}
        units={mockUnits}
        cycles={mockCycles}
        initialAssignments={mockAssignments}
        currentUser={adminUser}
      />,
    );

    const indSelect = screen.getByLabelText('Đơn vị phụ trách cho chỉ số KCI-01');
    fireEvent.change(indSelect, { target: { value: 'TT_KD' } });

    // Click Save for KCI-01 in its row
    const indRow = screen.getByText('KCI-01').closest('tr')!;
    const saveBtn = within(indRow).getByRole('button', { name: 'Lưu đơn vị cho KCI-01' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        '/api/profiles/HD11-R27/indicators/KCI-01/owner?cycle=2026',
        {
          method: 'PUT',
          body: { unitCode: 'TT_KD' },
        },
      );
    });
  });

  it('allows saving task unit assignment', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValueOnce({
      unit: mockUnits[2],
    });

    render(
      <AssignmentsView
        profiles={mockProfiles}
        units={mockUnits}
        cycles={mockCycles}
        initialAssignments={mockAssignments}
        currentUser={adminUser}
      />,
    );

    const taskSelect = screen.getByLabelText('Đơn vị thực hiện cho đầu việc KH-02');
    fireEvent.change(taskSelect, { target: { value: 'BAN_KT' } });

    // Click Save for KH-02 in its row
    const taskRow = screen.getByText('KH-02').closest('tr')!;
    const saveBtn = within(taskRow).getByRole('button', { name: 'Lưu đơn vị cho KH-02' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        '/api/tasks/22222222-2222-2222-2222-222222222222/unit',
        {
          method: 'PUT',
          body: { unitCode: 'BAN_KT' },
        },
      );
    });
  });

  it('renders Save button with accessible aria-label matching code on every row (S5)', () => {
    render(
      <AssignmentsView
        profiles={mockProfiles}
        units={mockUnits}
        cycles={mockCycles}
        initialAssignments={mockAssignments}
        currentUser={adminUser}
      />,
    );

    // Controls table
    expect(screen.getByRole('button', { name: 'Lưu đơn vị cho KS-01' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu đơn vị cho KS-02' })).toBeInTheDocument();

    // Indicators table
    expect(screen.getByRole('button', { name: 'Lưu đơn vị cho KRI-01' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu đơn vị cho KCI-01' })).toBeInTheDocument();

    // Tasks table
    expect(screen.getByRole('button', { name: 'Lưu đơn vị cho KH-01' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu đơn vị cho KH-02' })).toBeInTheDocument();
  });

  it('restricts ban4 role to read-only on Controls and Indicators tables', () => {
    render(
      <AssignmentsView
        profiles={mockProfiles}
        units={mockUnits}
        cycles={mockCycles}
        initialAssignments={mockAssignments}
        currentUser={ban4User}
      />,
    );

    // Notice shown
    expect(
      screen.getByText(/Chỉ quản trị viên được gán đơn vị cho bảng Kiểm soát/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Chỉ quản trị viên được gán đơn vị cho bảng Chỉ số/i),
    ).toBeInTheDocument();

    // Controls and Indicators selectors are disabled
    const controlBtn = screen.getByLabelText('Chọn đơn vị cho kiểm soát KS-01');
    expect(controlBtn).toBeDisabled();

    const indSelect = screen.getByLabelText('Đơn vị phụ trách cho chỉ số KRI-01');
    expect(indSelect).toBeDisabled();

    // Tasks selector is NOT disabled for ban4
    const taskSelect = screen.getByLabelText('Đơn vị thực hiện cho đầu việc KH-01');
    expect(taskSelect).not.toBeDisabled();
  });

  it('shows read-only archived banner when cycle status is archived', () => {
    render(
      <AssignmentsView
        profiles={mockProfiles}
        units={mockUnits}
        cycles={mockCycles}
        initialAssignments={mockAssignments}
        currentUser={adminUser}
        selectedCycleYear={2025} // 2025 is archived
      />,
    );

    expect(
      screen.getByText(/Chu kỳ 2025 đã được lưu trữ \(chỉ đọc\)/i),
    ).toBeInTheDocument();

    // All selectors are disabled
    expect(screen.getByLabelText('Chọn đơn vị cho kiểm soát KS-01')).toBeDisabled();
    expect(screen.getByLabelText('Đơn vị phụ trách cho chỉ số KRI-01')).toBeDisabled();
    expect(screen.getByLabelText('Đơn vị thực hiện cho đầu việc KH-01')).toBeDisabled();
  });
});
