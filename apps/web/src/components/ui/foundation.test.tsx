import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatCard } from '@/components/domain/StatCard';
import { Banner } from '@/components/domain/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ForbiddenState } from '@/components/ui/ForbiddenState';
import { RecordDrawer } from '@/components/data/RecordDrawer';

describe('StatCard component', () => {
  it('renders title, value, subtitle and link when provided', () => {
    render(
      <StatCard
        title="Số hồ sơ"
        value={4}
        subtitle="Hồ sơ rủi ro trọng yếu"
        href="/profiles"
      />,
    );
    expect(screen.getByText('Số hồ sơ')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Hồ sơ rủi ro trọng yếu')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/profiles');
  });
});

describe('Banner component', () => {
  it('renders banner with warning type and message', () => {
    render(
      <Banner
        type="warning"
        message="Thang 5 mức tạm thời, đang chờ Ban 4 xác nhận"
      />,
    );
    expect(screen.getByText('Thang 5 mức tạm thời, đang chờ Ban 4 xác nhận')).toBeInTheDocument();
  });
});

describe('EmptyState component', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="Chưa có chu kỳ nào"
        description="Vui lòng liên hệ ban quản trị để khởi tạo chu kỳ."
      />,
    );
    expect(screen.getByText('Chưa có chu kỳ nào')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng liên hệ ban quản trị để khởi tạo chu kỳ.')).toBeInTheDocument();
  });
});

describe('ErrorState component', () => {
  it('renders error message and retry button when onRetry is provided', () => {
    const handleRetry = vi.fn();
    render(
      <ErrorState
        message="Không thể kết nối đến máy chủ API."
        onRetry={handleRetry}
      />,
    );
    expect(screen.getByText('Không thể kết nối đến máy chủ API.')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /thử lại/i });
    fireEvent.click(btn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});

describe('RecordDrawer component', () => {
  it('opens dialog with title and children when open is true', () => {
    render(
      <RecordDrawer
        open={true}
        onOpenChange={() => {}}
        title="Chi tiết kế hoạch"
      >
        <div>Nội dung chi tiết bên trong</div>
      </RecordDrawer>,
    );
    expect(screen.getByText('Chi tiết kế hoạch')).toBeInTheDocument();
    expect(screen.getByText('Nội dung chi tiết bên trong')).toBeInTheDocument();
  });
});

import { PageHero } from '@/components/ui/PageHero';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

describe('PageHero component', () => {
  it('renders eyebrow, title and description correctly', () => {
    render(
      <PageHero
        eyebrow="BÁO CÁO RỦI RO TRỌNG YẾU"
        title="Tổng quan rủi ro 2026"
        description="Mô tả tóm tắt theo dõi chỉ số rủi ro."
      />,
    );
    expect(screen.getByText('BÁO CÁO RỦI RO TRỌNG YẾU')).toBeInTheDocument();
    expect(screen.getByText('Tổng quan rủi ro 2026')).toBeInTheDocument();
    expect(screen.getByText('Mô tả tóm tắt theo dõi chỉ số rủi ro.')).toBeInTheDocument();
  });
});

describe('Card component', () => {
  it('renders header with title, subtitle, badge and body content', () => {
    render(
      <Card
        title="Tiêu đề khối"
        subtitle="Phụ đề giải thích"
        badge={<span data-testid="card-badge">Đếm: 4</span>}
      >
        <div>Nội dung bên trong thẻ</div>
      </Card>,
    );
    expect(screen.getByText('Tiêu đề khối')).toBeInTheDocument();
    expect(screen.getByText('Phụ đề giải thích')).toBeInTheDocument();
    expect(screen.getByTestId('card-badge')).toBeInTheDocument();
    expect(screen.getByText('Nội dung bên trong thẻ')).toBeInTheDocument();
  });
});

describe('Pill component (levelLabel mapping)', () => {
  it('maps "Cao" and "Rất cao" to bad state style', () => {
    const { container: c1 } = render(<Pill levelLabel="Cao" score={12} />);
    expect(screen.getByText('Cao')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(c1.firstChild).toHaveClass('bg-state-bad-bg');

    const { container: c2 } = render(<Pill levelLabel="Rất cao" />);
    expect(c2.firstChild).toHaveClass('bg-state-bad-bg');
  });

  it('maps "Trung bình" to warn state style', () => {
    const { container } = render(<Pill levelLabel="Trung bình" />);
    expect(screen.getByText('Trung bình')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-state-warn-bg');
  });

  it('maps "Thấp" to ok state style', () => {
    const { container } = render(<Pill levelLabel="Thấp" />);
    expect(screen.getByText('Thấp')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-state-ok-bg');
  });

  it('maps unknown label and null to none (gray) state style', () => {
    const { container: c1 } = render(<Pill levelLabel="Mức không xác định" />);
    expect(screen.getByText('Mức không xác định')).toBeInTheDocument();
    expect(c1.firstChild).toHaveClass('bg-state-none-bg');

    const { container: c2 } = render(<Pill levelLabel={null} />);
    expect(screen.getByText('Chưa nhập')).toBeInTheDocument();
    expect(c2.firstChild).toHaveClass('bg-state-none-bg');
  });
});

describe('ForbiddenState component', () => {
  it('renders forbidden title, message and home link', () => {
    render(
      <ForbiddenState
        title="Truy cập bị từ chối"
        message="Chỉ quản trị viên mới có thể xem trang này."
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Truy cập bị từ chối')).toBeInTheDocument();
    expect(screen.getByText('Chỉ quản trị viên mới có thể xem trang này.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Quay lại trang chủ/i });
    expect(link).toHaveAttribute('href', '/');
  });
});
