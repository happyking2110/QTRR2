import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppHeader, type AppHeaderProps } from './AppHeader';

let mockSearchParams = new URLSearchParams();

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => mockSearchParams,
}));

describe('AppHeader component', () => {
  const mockProps = {
    cycles: [{ year: 2026, status: 'open' as const }],
    periods: [
      {
        key: '2026-Q4',
        kind: 'quarter' as const,
        label: 'Quý 4/2026',
        startsOn: '2026-10-01',
        endsOn: '2026-12-31',
        dueAt: '2027-01-10T23:59:59Z',
        closed: false,
        closedAt: null,
        closedByName: null,
        reopenReason: null,
      },
    ],
    profiles: [
      {
        riskCode: 'HD11.R27',
        hsrrCode: 'HSRRTY_MBF_2026_HD11.R27',
        name: 'Rủi ro an toàn thông tin',
        owner: 'Ban CNTT',
        riskGroup: 'CNTT',
        residualLevel: 'Cực kỳ nghiêm trọng',
        inherentLevel: 'Cực kỳ nghiêm trọng',
      },
      {
        riskCode: 'CN02.R13',
        hsrrCode: 'HSRRTY_MBF_2026_CN02.R13',
        name: 'Rủi ro pháp lý',
        owner: 'Ban Pháp chế',
        riskGroup: 'Pháp chế',
        residualLevel: 'Cao',
        inherentLevel: 'Cao',
      },
    ] as unknown as AppHeaderProps['profiles'],
    selectedCycleYear: 2026,
  };

  it('renders "Tổng quan", "Chỉ số", and "Mã Rủi ro" dropdown with profiles', () => {
    render(<AppHeader {...mockProps} />);
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chỉ số' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kế hoạch hành động' })).toBeInTheDocument();

    const riskBtn = screen.getByRole('button', { name: /mã rủi ro/i });
    expect(riskBtn).toBeInTheDocument();

    fireEvent.click(riskBtn);
    expect(screen.getByRole('menuitem', { name: /HD11.R27/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /CN02.R13/ })).toBeInTheDocument();
  });

  it('nav element does not contain justify-center class on scroll container (S5)', () => {
    render(<AppHeader {...mockProps} />);
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav).toBeInTheDocument();
    expect(nav.className).not.toContain('justify-center');
    expect(nav.className).not.toContain('md:justify-center');
    expect(nav.className).not.toContain('lg:justify-center');
    expect(nav.className).toContain('justify-start');
  });

  it('renders period switcher and branding text', () => {
    render(<AppHeader {...mockProps} />);
    expect(screen.getByText('MBF Risk Monitor')).toBeInTheDocument();
    expect(screen.getByText(/Hồ sơ rủi ro trọng yếu 2026/)).toBeInTheDocument();
    expect(screen.getByLabelText('Chọn chu kỳ')).toBeInTheDocument();
  });

  it('retains only cycle and period in navigation links (S3)', () => {
    mockSearchParams = new URLSearchParams('profile=HD11.R27&cycle=2026&period=2026-Q4&extra=123');
    render(<AppHeader {...mockProps} />);
    const actionsLink = screen.getByRole('link', { name: 'Kế hoạch hành động' });
    expect(actionsLink).toHaveAttribute('href', '/actions?cycle=2026&period=2026-Q4');
    const indicatorsLink = screen.getByRole('link', { name: 'Chỉ số' });
    expect(indicatorsLink).toHaveAttribute('href', '/indicators?cycle=2026&period=2026-Q4');
    
    // Mở dropdown Mã Rủi ro để kiểm tra link profile
    fireEvent.click(screen.getByRole('button', { name: /mã rủi ro/i }));
    const profileLink = screen.getByRole('menuitem', { name: /CN02.R13/ });
    expect(profileLink).toHaveAttribute('href', '/profiles/CN02.R13?cycle=2026&period=2026-Q4');
    const overviewLink = screen.getByRole('link', { name: 'Tổng quan' });
    expect(overviewLink).toHaveAttribute('href', '/?cycle=2026&period=2026-Q4');
  });

  it('renders "Chờ duyệt" link inside UserNavMenu for non-viewer role and hides for viewer role', () => {
    const { rerender } = render(
      <AppHeader
        {...mockProps}
        currentUser={{
          id: 'u1',
          fullName: 'Admin',
          email: 'admin@mbf.vn',
          role: 'admin',
          unit: null,
          mustChangePassword: false,
        }}
      />,
    );
    const userButtons = screen.getAllByRole('button', { name: /Menu người dùng/i });
    fireEvent.click(userButtons[0]);
    expect(screen.getByRole('menuitem', { name: /chờ duyệt/i })).toBeInTheDocument();

    rerender(
      <AppHeader
        {...mockProps}
        currentUser={{
          id: 'u2',
          fullName: 'Viewer',
          email: 'viewer@mbf.vn',
          role: 'viewer',
          unit: null,
          mustChangePassword: false,
        }}
      />,
    );
    const viewerButtons = screen.getAllByRole('button', { name: /Menu người dùng/i });
    fireEvent.click(viewerButtons[0]);
    expect(screen.queryByRole('menuitem', { name: /chờ duyệt/i })).not.toBeInTheDocument();
  });
});

