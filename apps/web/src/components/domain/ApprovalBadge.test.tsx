import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApprovalBadge } from './ApprovalBadge';

describe('ApprovalBadge component', () => {
  it('renders "Chờ duyệt" with purple token styling for pending status', () => {
    const { container } = render(<ApprovalBadge status="pending" />);
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('bg-state-wait-bg');
    expect(badge).toHaveClass('text-state-wait-fg');
  });

  it('renders "Đã duyệt" for approved status', () => {
    render(<ApprovalBadge status="approved" />);
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument();
  });

  it('renders "Bị từ chối" for rejected status', () => {
    render(<ApprovalBadge status="rejected" />);
    expect(screen.getByText('Bị từ chối')).toBeInTheDocument();
  });

  it('renders "Đã rút" for withdrawn status', () => {
    render(<ApprovalBadge status="withdrawn" />);
    expect(screen.getByText('Đã rút')).toBeInTheDocument();
  });
});
