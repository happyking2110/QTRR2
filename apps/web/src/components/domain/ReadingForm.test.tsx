import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReadingForm, type ReadingFormIndicator } from './ReadingForm';
import * as client from '@/lib/api/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockAutoIndicator: ReadingFormIndicator = {
  id: 'ind-auto-1',
  code: 'HD11.R27.KRI01',
  name: 'Tỷ lệ thuê bao gián đoạn',
  kind: 'kri',
  mode: 'auto',
  formula: 'Số TB gián đoạn / Tổng TB * 100',
  frequency: 'Hàng tháng',
  thresholds: {
    green: '<= 5%',
    yellow: '> 5% - 10%',
    red: '> 10%',
  },
  submitPeriodKeys: ['2026-10', '2026-11'],
  pendingSubmissions: [],
};

const mockManualIndicator: ReadingFormIndicator = {
  id: 'ind-manual-1',
  code: 'HD11.R27.KRI02',
  name: 'Số sự cố CNTT nghiêm trọng',
  kind: 'kri',
  mode: 'manual',
  formula: 'Đếm số sự cố mức 1',
  frequency: 'Hàng quý',
  thresholds: {
    green: 'Không phát sinh sự cố',
    yellow: 'Phát sinh 1 sự cố nhưng khắc phục trong 2h',
    red: 'Phát sinh từ 2 sự cố hoặc trên 4h',
  },
  submitPeriodKeys: ['2026-Q4'],
  pendingSubmissions: [],
};

describe('ReadingForm component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders period select strictly matching submitPeriodKeys', () => {
    render(
      <ReadingForm
        indicator={mockAutoIndicator}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const periodSelect = screen.getByLabelText(/kỳ báo cáo/i) as HTMLSelectElement;
    expect(periodSelect).toBeInTheDocument();
    expect(periodSelect.options).toHaveLength(2);
    expect(periodSelect.options[0].value).toBe('2026-10');
    expect(periodSelect.options[1].value).toBe('2026-11');
  });

  it('calls zone-preview after 300ms debounce in auto mode and displays server zone', async () => {
    vi.useFakeTimers();
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockResolvedValue({
      mode: 'auto',
      zone: 'yellow',
      rule: '> 5% – 10%',
    });

    render(
      <ReadingForm
        indicator={mockAutoIndicator}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const valueInput = screen.getByLabelText(/giá trị đo lường/i);
    fireEvent.change(valueInput, { target: { value: '7.5' } });

    // Spy should NOT be called immediately
    expect(apiSendSpy).not.toHaveBeenCalled();

    // Fast forward 299ms - still not called
    await vi.advanceTimersByTimeAsync(299);
    expect(apiSendSpy).not.toHaveBeenCalled();

    // Advance 1ms more (total 300ms)
    await vi.advanceTimersByTimeAsync(1);

    expect(apiSendSpy).toHaveBeenCalledWith(
      'GET',
      '/api/indicators/ind-auto-1/zone-preview?value=7.5',
    );

    // Verify preview zone badge rendered
    expect(screen.getByText('Cảnh báo')).toBeInTheDocument();
  });

  it('enforces selecting a zone and >= 10 chars zoneNote in manual mode', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend');

    render(
      <ReadingForm
        indicator={mockManualIndicator}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // Expect original threshold texts on zone buttons (or summary)
    expect(screen.getAllByText('Không phát sinh sự cố').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText('Phát sinh 1 sự cố nhưng khắc phục trong 2h').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText('Phát sinh từ 2 sự cố hoặc trên 4h').length,
    ).toBeGreaterThanOrEqual(1);

    const submitBtn = screen.getByRole('button', { name: /nộp để duyệt/i });

    // Click submit without selecting zone
    fireEvent.click(submitBtn);
    expect(screen.getByText(/vui lòng chọn vùng đánh giá/i)).toBeInTheDocument();
    expect(apiSendSpy).not.toHaveBeenCalled();

    // Select Green zone button
    const greenBtn = screen.getByRole('button', { name: /vùng xanh/i });
    fireEvent.click(greenBtn);

    // Try submit with empty reason
    fireEvent.click(submitBtn);
    expect(screen.getByText(/trường dữ liệu này là bắt buộc/i)).toBeInTheDocument();
    expect(apiSendSpy).not.toHaveBeenCalled();

    // Enter short reason (< 10 chars)
    const reasonInput = screen.getByLabelText(/lý do chọn vùng/i);
    fireEvent.change(reasonInput, { target: { value: 'Ngắn' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText(/lý do chọn vùng bắt buộc tối thiểu 10 ký tự/i)).toBeInTheDocument();

    // Enter valid reason >= 10 chars
    fireEvent.change(reasonInput, {
      target: { value: 'Đã hoàn tất kiểm tra và không phát hiện sự cố' },
    });
    apiSendSpy.mockResolvedValueOnce({
      id: 'sub-new-1',
      status: 'pending',
    });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/indicators/ind-manual-1/readings',
        expect.objectContaining({
          periodKey: '2026-Q4',
          zone: 'green',
          zoneNote: 'Đã hoàn tất kiểm tra và không phát hiện sự cố',
        }),
      );
    });
  });

  it('displays warning and withdraw button when pending submission exists for same period', () => {
    const indicatorWithPending: ReadingFormIndicator = {
      ...mockAutoIndicator,
      pendingSubmissions: [
        {
          id: 'sub-pending-1',
          periodKey: '2026-10',
          submittedAt: '2026-10-12T08:00:00Z',
          submittedByName: 'Nguyễn Văn A',
          canWithdraw: true,
        },
      ],
    };

    render(
      <ReadingForm
        indicator={indicatorWithPending}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Đang có một bản chờ duyệt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rút bản cũ/i })).toBeInTheDocument();
  });

  it('displays error banner when API returns PERIOD_CLOSED', async () => {
    vi.spyOn(client, 'apiSend').mockRejectedValue(
      new client.ApiClientError({
        code: 'PERIOD_CLOSED',
        message: 'Kỳ báo cáo đã đóng, không thể sửa đổi số liệu.',
        statusCode: 409,
      }),
    );

    render(
      <ReadingForm
        indicator={mockAutoIndicator}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const valueInput = screen.getByLabelText(/giá trị đo lường/i);
    fireEvent.change(valueInput, { target: { value: '4.5' } });

    const submitBtn = screen.getByRole('button', { name: /nộp để duyệt/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Kỳ báo cáo đã đóng, không thể sửa đổi số liệu/i)).toBeInTheDocument();
    });
  });

  it('maps fieldErrors from API to corresponding form fields', async () => {
    vi.spyOn(client, 'apiSend').mockRejectedValue(
      new client.ApiClientError({
        code: 'VALIDATION',
        message: 'Dữ liệu không hợp lệ',
        statusCode: 422,
        fieldErrors: {
          valueNum: 'Giá trị phải nằm trong khoảng 0 đến 100',
        },
      }),
    );

    render(
      <ReadingForm
        indicator={mockAutoIndicator}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const valueInput = screen.getByLabelText(/giá trị đo lường/i);
    fireEvent.change(valueInput, { target: { value: '50' } });

    const submitBtn = screen.getByRole('button', { name: /nộp để duyệt/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Giá trị phải nằm trong khoảng 0 đến 100')).toBeInTheDocument();
    });
  });

  it('validates unitKind = "count" requiring non-negative integer and displays count unitLabel (W7)', async () => {
    const mockCountIndicator: ReadingFormIndicator = {
      ...mockAutoIndicator,
      id: 'kri-count',
      code: 'CN03.R14.KRI01',
      unitKind: 'count',
      unitLabel: 'vụ việc',
    };

    render(
      <ReadingForm
        indicator={mockCountIndicator}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Giá trị đo lường \(vụ việc\)/i)).toBeInTheDocument();
    expect(screen.getByText('vụ việc')).toBeInTheDocument();
    // In mode = auto, manual zone buttons should NOT be rendered
    expect(screen.queryByText(/Vui lòng chọn vùng đánh giá/i)).toBeNull();

    const valueInput = screen.getByLabelText(/giá trị đo lường/i);
    // Non-integer value like 1.5 should show validation error
    fireEvent.change(valueInput, { target: { value: '1.5' } });

    const submitBtn = screen.getByRole('button', { name: /nộp để duyệt/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Giá trị phải là số nguyên không âm')).toBeInTheDocument();
    });
  });
});
