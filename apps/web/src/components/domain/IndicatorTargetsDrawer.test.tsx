import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IndicatorTargetsDrawer } from './IndicatorTargetsDrawer';
import { apiSend } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type Indicator = components['schemas']['Indicator'];

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiSend: vi.fn(),
  };
});

describe('IndicatorTargetsDrawer (Plan 4C W6)', () => {
  const mockKri: Indicator = {
    id: 'kri-01',
    code: 'CN03.R14.KRI01',
    name: 'Số vụ lộ lọt dữ liệu',
    kind: 'kri',
    frequency: 'Tháng',
    mode: 'auto',
    thresholds: {
      green: '0 vụ',
      yellow: '1 vụ',
      red: '≥ 2 vụ',
    },
    currentValue: '1 vụ việc',
    currentZone: 'yellow',
    unitKind: 'count',
    unitLabel: 'vụ việc',
    direction: 'higher_is_worse',
    yellowAt: 1,
    redAt: 2,
    targetValue: null,
    targetProgress: null,
    dataSource: 'Hệ thống SOC',
    submitPeriodKeys: [],
  };

  const mockKci: Indicator = {
    id: 'kci-01',
    code: 'HD11.R27.KCI02',
    name: 'Tỷ lệ hệ thống diễn tập DR đạt yêu cầu',
    kind: 'kci',
    frequency: 'Theo đợt diễn tập',
    mode: 'auto',
    thresholds: {
      green: '≥ 95%',
      yellow: '80% - < 95%',
      red: '< 80%',
    },
    currentValue: '92%',
    currentZone: 'yellow',
    unitKind: 'percent',
    unitLabel: '%',
    direction: 'lower_is_worse',
    yellowAt: 95,
    redAt: 80,
    targetValue: 100,
    targetProgress: 92,
    dataSource: null,
    submitPeriodKeys: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders KRI target settings without targetValue field', () => {
    render(
      <IndicatorTargetsDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="CN03.R14"
        indicator={mockKri}
      />
    );

    expect(screen.getByText(/Thiết lập ngưỡng và mục tiêu/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('vụ việc')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    // targetValue should NOT be present for KRI
    expect(screen.queryByLabelText(/Mục tiêu kiểm soát/)).toBeNull();
  });

  it('renders KCI target settings with targetValue field', () => {
    render(
      <IndicatorTargetsDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        indicator={mockKci}
      />
    );

    expect(screen.getByLabelText(/Mục tiêu kiểm soát/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
  });

  it('submits PUT request with exact schema matching IndicatorTargetsInput', async () => {
    (apiSend as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...mockKri,
      yellowAt: 2,
      redAt: 4,
    });

    const onOpenChange = vi.fn();
    render(
      <IndicatorTargetsDrawer
        open={true}
        onOpenChange={onOpenChange}
        riskCode="CN03.R14"
        indicator={mockKri}
        cycle={2026}
      />
    );

    const yellowInput = screen.getByLabelText(/Ngưỡng cảnh báo vàng/);
    fireEvent.change(yellowInput, { target: { value: '2' } });

    const redInput = screen.getByLabelText(/Ngưỡng báo động đỏ/);
    fireEvent.change(redInput, { target: { value: '4' } });

    const submitBtn = screen.getByText('Lưu thiết lập');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSend).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/CN03.R14/indicators/CN03.R14.KRI01/targets?cycle=2026',
        {
          unitKind: 'count',
          unitLabel: 'vụ việc',
          direction: 'higher_is_worse',
          yellowAt: 2,
          redAt: 4,
          targetValue: null,
        }
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
