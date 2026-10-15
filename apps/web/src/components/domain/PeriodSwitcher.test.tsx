import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PeriodSwitcher } from './PeriodSwitcher';

// Mock apiSend
vi.mock('@/lib/api/client', () => ({
  apiSend: vi.fn().mockImplementation((method, path) => {
    if (path.includes('2027')) {
      return Promise.resolve([
        {
          key: '2027-Q1',
          kind: 'quarter',
          label: 'Quý 1/2027',
          startsOn: '2027-01-01',
          endsOn: '2027-03-31',
          dueAt: '',
          closed: false,
          closedAt: null,
          closedByName: null,
          reopenReason: null,
        },
      ]);
    }
    return Promise.resolve([]);
  }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('PeriodSwitcher component', () => {
  it('renders "Chưa có chu kỳ" when cycles array is empty', () => {
    render(
      <PeriodSwitcher
        cycles={[]}
        periods={[]}
        selectedCycle={null}
        selectedPeriod={null}
      />,
    );
    expect(screen.getByText('Chưa có chu kỳ')).toBeInTheDocument();
  });

  it('renders "Chưa có kỳ" when periods array is empty but cycle exists', () => {
    render(
      <PeriodSwitcher
        cycles={[{ year: 2026, status: 'open' }]}
        periods={[]}
        selectedCycle={2026}
        selectedPeriod={null}
      />,
    );
    expect(screen.getByText('Chưa có kỳ')).toBeInTheDocument();
  });

  it('renders cycles and periods dropdown when data is available', () => {
    render(
      <PeriodSwitcher
        cycles={[{ year: 2026, status: 'open' }]}
        periods={[
          {
            key: '2026-Q4',
            kind: 'quarter',
            label: 'Quý 4/2026',
            startsOn: '2026-10-01',
            endsOn: '2026-12-31',
            dueAt: '2027-01-10T23:59:59Z',
            closed: false,
            closedAt: null,
            closedByName: null,
            reopenReason: null,
          },
        ]}
        selectedCycle={2026}
        selectedPeriod="2026-Q4"
      />,
    );
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByText('Quý 4/2026')).toBeInTheDocument();
  });

  it('(a) khi selectedPeriod = null thì lựa chọn đang hiện là mục mặc định, không phải kỳ cuối danh sách', () => {
    render(
      <PeriodSwitcher
        cycles={[{ year: 2026, status: 'open' }]}
        periods={[
          {
            key: '2026-Q1',
            kind: 'quarter',
            label: 'Quý 1/2026',
            startsOn: '2026-01-01',
            endsOn: '2026-03-31',
            dueAt: '',
            closed: false,
            closedAt: null,
            closedByName: null,
            reopenReason: null,
          },
          {
            key: '2026-09',
            kind: 'month',
            label: 'Tháng 09/2026',
            startsOn: '2026-09-01',
            endsOn: '2026-09-30',
            dueAt: '',
            closed: false,
            closedAt: null,
            closedByName: null,
            reopenReason: null,
          },
          {
            key: '2026-12',
            kind: 'month',
            label: 'Tháng 12/2026',
            startsOn: '2026-12-01',
            endsOn: '2026-12-31',
            dueAt: '',
            closed: false,
            closedAt: null,
            closedByName: null,
            reopenReason: null,
          },
        ]}
        selectedCycle={2026}
        selectedPeriod={null}
      />,
    );
    const select = screen.getByLabelText('Chọn kỳ báo cáo') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select.selectedOptions[0].text).toContain('Kỳ hiện hành (mặc định)');
    expect(select.selectedOptions[0].text).not.toContain('Tháng 12/2026');
  });

  it('(b) khi selectedPeriod = "2026-09" thì hiện đúng "Tháng 09/2026"', () => {
    render(
      <PeriodSwitcher
        cycles={[{ year: 2026, status: 'open' }]}
        periods={[
          {
            key: '2026-Q1',
            kind: 'quarter',
            label: 'Quý 1/2026',
            startsOn: '2026-01-01',
            endsOn: '2026-03-31',
            dueAt: '',
            closed: false,
            closedAt: null,
            closedByName: null,
            reopenReason: null,
          },
          {
            key: '2026-09',
            kind: 'month',
            label: 'Tháng 09/2026',
            startsOn: '2026-09-01',
            endsOn: '2026-09-30',
            dueAt: '',
            closed: false,
            closedAt: null,
            closedByName: null,
            reopenReason: null,
          },
          {
            key: '2026-12',
            kind: 'month',
            label: 'Tháng 12/2026',
            startsOn: '2026-12-01',
            endsOn: '2026-12-31',
            dueAt: '',
            closed: false,
            closedAt: null,
            closedByName: null,
            reopenReason: null,
          },
        ]}
        selectedCycle={2026}
        selectedPeriod="2026-Q1"
      />,
    );
    const select = screen.getByLabelText('Chọn kỳ báo cáo') as HTMLSelectElement;
    expect(select.value).toBe('2026-Q1');
    expect(select.selectedOptions[0].text).toContain('Quý 1/2026');
    // Đảm bảo các tháng bị loại bỏ khỏi dropdown
    const optionTexts = Array.from(select.options).map((opt) => opt.text);
    expect(optionTexts.some((t) => t.includes('Tháng 09/2026'))).toBe(false);
    expect(optionTexts.some((t) => t.includes('Tháng 12/2026'))).toBe(false);
  });

  it('tải lại danh sách kỳ khi chu kỳ được chọn không khớp với danh sách kỳ hiện tại', async () => {
    render(
      <PeriodSwitcher
        cycles={[
          { year: 2028, status: 'open' },
          { year: 2027, status: 'open' },
        ]}
        periods={[
          {
            key: '2028-Q1',
            kind: 'quarter',
            label: 'Quý 1/2028',
            startsOn: '2028-01-01',
            endsOn: '2028-03-31',
            dueAt: '',
            closed: false,
            closedAt: null,
            closedByName: null,
            reopenReason: null,
          },
        ]}
        selectedCycle={2027}
        selectedPeriod={null}
      />,
    );

    await waitFor(() => {
      const select = screen.getByLabelText('Chọn kỳ báo cáo') as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(screen.getByText('Quý 1/2027')).toBeInTheDocument();
    });
  });
});
