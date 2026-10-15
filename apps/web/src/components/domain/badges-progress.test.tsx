import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ZoneBadge } from './ZoneBadge';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';

describe('ZoneBadge component', () => {
  it('renders KRI green as "Trong ngưỡng"', () => {
    render(<ZoneBadge kind="kri" zone="green" />);
    expect(screen.getByText('Trong ngưỡng')).toBeInTheDocument();
  });

  it('renders KRI yellow as "Cảnh báo"', () => {
    render(<ZoneBadge kind="kri" zone="yellow" />);
    expect(screen.getByText('Cảnh báo')).toBeInTheDocument();
  });

  it('renders KRI red as "Vượt ngưỡng"', () => {
    render(<ZoneBadge kind="kri" zone="red" />);
    expect(screen.getByText('Vượt ngưỡng')).toBeInTheDocument();
  });

  it('renders KCI green as "Hiệu quả"', () => {
    render(<ZoneBadge kind="kci" zone="green" />);
    expect(screen.getByText('Hiệu quả')).toBeInTheDocument();
  });

  it('renders KCI yellow as "Hiệu quả một phần"', () => {
    render(<ZoneBadge kind="kci" zone="yellow" />);
    expect(screen.getByText('Hiệu quả một phần')).toBeInTheDocument();
  });

  it('renders KCI red as "Chưa hiệu quả"', () => {
    render(<ZoneBadge kind="kci" zone="red" />);
    expect(screen.getByText('Chưa hiệu quả')).toBeInTheDocument();
  });

  it('renders null zone as "Chưa có số liệu" with neutral style', () => {
    render(<ZoneBadge kind="kri" zone={null} />);
    expect(screen.getByText('Chưa có số liệu')).toBeInTheDocument();
  });
});

describe('StatusBadge component', () => {
  it('renders completed status as "Hoàn thành"', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Hoàn thành')).toBeInTheDocument();
  });

  it('renders overdue status as "Quá hạn"', () => {
    render(<StatusBadge status="overdue" />);
    expect(screen.getByText('Quá hạn')).toBeInTheDocument();
  });

  it('renders at_risk status as "Có nguy cơ chậm"', () => {
    render(<StatusBadge status="at_risk" />);
    expect(screen.getByText('Có nguy cơ chậm')).toBeInTheDocument();
  });

  it('renders in_progress status as "Đang thực hiện"', () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('Đang thực hiện')).toBeInTheDocument();
  });

  it('renders not_started status as "Chưa bắt đầu"', () => {
    render(<StatusBadge status="not_started" />);
    expect(screen.getByText('Chưa bắt đầu')).toBeInTheDocument();
  });
});

describe('ProgressBar component', () => {
  it('renders progressbar role with aria-valuenow and formatted percentage label', () => {
    render(<ProgressBar value={42.5} showLabel />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42.5');
    expect(screen.getByText('42,5%')).toBeInTheDocument();
  });

  it('renders "—" when value is null', () => {
    render(<ProgressBar value={null} showLabel />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
