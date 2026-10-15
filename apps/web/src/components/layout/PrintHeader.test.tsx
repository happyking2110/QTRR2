import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrintHeader } from './PrintHeader';

describe('PrintHeader component', () => {
  it('renders product branding and title correctly', () => {
    render(
      <PrintHeader
        title="Hồ sơ HD11.R27 – An toàn thông tin"
        cycle="2026"
        period="Quý 4/2026"
        printedBy="Nguyễn Văn A"
      />
    );

    const header = screen.getByTestId('print-header');
    expect(header).toBeInTheDocument();
    expect(screen.getByText('MBF Risk Monitor')).toBeInTheDocument();
    expect(screen.getByText('Hồ sơ rủi ro trọng yếu')).toBeInTheDocument();
    expect(screen.getByText(/Chu kỳ:/)).toBeInTheDocument();
    expect(screen.getByText(/Quý 4\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Nguyễn Văn A/)).toBeInTheDocument();
    expect(screen.getByText(/Thời điểm in:/)).toBeInTheDocument();
  });

  it('uses default fallback for printedBy when omitted', () => {
    render(
      <PrintHeader
        title="Báo cáo Tổng quan"
        cycle="2026"
      />
    );

    expect(screen.getByText(/Thành viên MBF/)).toBeInTheDocument();
  });

  it('applies forceVisible class correctly', () => {
    const { rerender } = render(
      <PrintHeader title="Test" forceVisible={false} />
    );
    let header = screen.getByTestId('print-header');
    expect(header.className).toContain('hidden print:block');

    rerender(<PrintHeader title="Test" forceVisible={true} />);
    header = screen.getByTestId('print-header');
    expect(header.className).toContain('block');
  });
});
