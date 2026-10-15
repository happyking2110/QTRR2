import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileFormDrawer } from './ProfileFormDrawer';
import { ActionFormDrawer } from './ActionFormDrawer';
import { IndicatorFormDrawer } from './IndicatorFormDrawer';
import { LinkCodesDialog } from './LinkCodesDialog';
import { ReferencedAlert } from '@/components/ui/ReferencedAlert';

// Mock useRouter and useSearchParams
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock apiSend
vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiSend: vi.fn(),
  };
});

describe('Plan 4A W2 Drawers and Dialogs', () => {
  it('ReferencedAlert renders list of items from details array or object', () => {
    const errorObj = {
      code: 'REFERENCED',
      message: 'Mục đang được liên kết',
      details: ['HD11.R27.KS01', 'HD11.R27.KH02'],
    };

    const { rerender } = render(<ReferencedAlert error={errorObj} />);
    expect(screen.getByText(/Danh sách mục đang tham chiếu/)).toBeInTheDocument();
    expect(screen.getByText('HD11.R27.KS01')).toBeInTheDocument();
    expect(screen.getByText('HD11.R27.KH02')).toBeInTheDocument();

    // Rerender with null error -> renders nothing
    rerender(<ReferencedAlert error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ProfileFormDrawer disables riskCode field when initialProfile is provided (edit mode)', () => {
    render(
      <ProfileFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        initialProfile={{
          riskCode: 'HD11.R27',
          name: 'Rủi ro ATTT',
          hsrrCode: 'HSRRTY_MBF_2026_HD11.R27',
          riskType: 'Rủi ro vận hành',
          riskZone: 'Khối CQ',
          riskGroup: 'CNTT',
          owner: 'Ban CNTT',
          inherent: {
            impactLabel: 'Nghiêm trọng',
            likelihoodLabel: 'Nhiều khả năng xảy ra',
            levelLabel: 'Cao',
          },
        }}
      />,
    );

    expect(screen.getByText(/Sửa hồ sơ rủi ro/i)).toBeInTheDocument();
    const codeInput = screen.getByLabelText(/Mã rủi ro/i);
    expect(codeInput).toBeDisabled();
    expect(codeInput).toHaveValue('HD11.R27');
  });

  it('ActionFormDrawer allows inputting dueText string and does not expose dueDate field', () => {
    render(
      <ActionFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        initialAction={{
          code: 'HD11.R27.KH01',
          description: 'Hành động 1',
          responsibilityText: 'Ban CNTT',
          deliverable: 'Báo cáo',
          dueText: 'Quý 4/2026',
        }}
      />,
    );

    expect(screen.getByLabelText(/Thời hạn hoàn thành \(văn bản\)/i)).toHaveValue('Quý 4/2026');
    // Ensure there is no input for dueDate date-picker
    expect(screen.queryByLabelText(/Ngày hạn cụ thể/i)).toBeNull();
  });

  it('IndicatorFormDrawer shows 4 frequency options and threshold warning', () => {
    render(
      <IndicatorFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        kind="kri"
      />,
    );

    const freqSelect = screen.getByLabelText(/Tần suất báo cáo/i);
    expect(freqSelect).toBeInTheDocument();
    // 4 frequencies: Tháng, Quý, Hàng quý, Theo đợt diễn tập
    expect(screen.getByRole('option', { name: 'Tháng' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Quý' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hàng quý' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Theo đợt diễn tập' })).toBeInTheDocument();

    expect(screen.getByText(/Khi thay đổi cấu hình ngưỡng/i)).toBeInTheDocument();
  });

  it('LinkCodesDialog allows toggling codes and submitting selection', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <LinkCodesDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Liên kết kiểm soát"
        currentLinkedCodes={['KS01']}
        availableItems={[
          { code: 'KS01', text: 'Kiểm soát định kỳ' },
          { code: 'KS02', text: 'Kiểm soát bất thường' },
        ]}
        onSave={onSave}
      />,
    );

    expect(screen.getByText('KS01')).toBeInTheDocument();
    expect(screen.getByText('KS02')).toBeInTheDocument();

    // Toggle KS02
    fireEvent.click(screen.getByText('KS02'));

    // Save
    const saveBtn = screen.getByRole('button', { name: 'Lưu liên kết' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(['KS01', 'KS02']);
    });
  });
});
