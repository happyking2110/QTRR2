import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResidualAssessmentDialog } from './ResidualAssessmentDialog';
import * as client from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type PeriodSummary = components['schemas']['PeriodSummary'];
type ResidualEntry = components['schemas']['ResidualEntry'];

const mockPeriods: PeriodSummary[] = [
  {
    key: '2026-Q1',
    kind: 'quarter',
    label: 'Quý 1/2026',
    startsOn: '2026-01-01',
    endsOn: '2026-03-31',
    dueAt: '2026-04-10T23:59:59Z',
    closed: false,
    closedAt: null,
    closedByName: null,
    reopenReason: null,
  },
  {
    key: '2026-Q2',
    kind: 'quarter',
    label: 'Quý 2/2026',
    startsOn: '2026-04-01',
    endsOn: '2026-06-30',
    dueAt: '2026-07-10T23:59:59Z',
    closed: true, // Closed quarter, should not be included
    closedAt: '2026-07-11T00:00:00Z',
    closedByName: 'Admin',
    reopenReason: null,
  },
  {
    key: '2026-Q3',
    kind: 'quarter',
    label: 'Quý 3/2026',
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    dueAt: '2026-10-10T23:59:59Z',
    closed: false,
    closedAt: null,
    closedByName: null,
    reopenReason: null,
  },
  {
    key: '2026-10',
    kind: 'month', // Month, should not be included
    label: 'Tháng 10/2026',
    startsOn: '2026-10-01',
    endsOn: '2026-10-31',
    dueAt: '2026-11-10T23:59:59Z',
    closed: false,
    closedAt: null,
    closedByName: null,
    reopenReason: null,
  },
];

const mockResidualHistory: ResidualEntry[] = [
  {
    periodKey: '2026-Q1',
    rating: {
      impactScore: 4,
      likelihoodScore: 3,
      impactLabel: 'Cao',
      likelihoodLabel: 'Trung bình',
      levelLabel: 'Cao',
    },
  },
];

describe('ResidualAssessmentDialog component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with unclosed quarter periods and warns on overwrite', async () => {
    vi.spyOn(client, 'apiSend').mockImplementation((method: unknown, path: unknown) => {
      if (typeof path === 'string' && path.includes('/periods')) {
        return Promise.resolve(mockPeriods);
      }
      if (typeof path === 'string' && path.includes('/heatmap')) {
        return Promise.resolve({
          scaleProvisional: true,
          impactLevels: [
            { score: 1, label: 'Rất thấp' },
            { score: 2, label: 'Thấp' },
            { score: 3, label: 'Trung bình' },
            { score: 4, label: 'Cao' },
            { score: 5, label: 'Rất cao' },
          ],
          likelihoodLevels: [
            { score: 1, label: 'Rất thấp' },
            { score: 2, label: 'Thấp' },
            { score: 3, label: 'Trung bình' },
            { score: 4, label: 'Cao' },
            { score: 5, label: 'Rất cao' },
          ],
          points: [],
        });
      }
      return Promise.resolve({});
    });

    render(
      <ResidualAssessmentDialog
        riskCode="HD11.R27"
        cycleYear={2026}
        residualHistory={mockResidualHistory}
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    // Dialog title
    expect(screen.getByText('Nhập mức rủi ro còn lại')).toBeInTheDocument();
    expect(screen.getByText(/Thang 5 mức tạm thời/)).toBeInTheDocument();

    // Check periods loaded: 2026-Q1 and 2026-Q3 should be present, but not 2026-Q2 (closed) or 2026-10 (month)
    await waitFor(() => {
      expect(screen.getAllByText(/Quý 1\/2026/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/Quý 3\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Quý 2\/2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tháng 10\/2026/)).not.toBeInTheDocument();

    // Since 2026-Q1 is default selected and exists in residualHistory, overwrite alert should be shown
    expect(screen.getByText(/Cảnh báo ghi đè/)).toBeInTheDocument();
    expect(screen.getByText(/Lưu bản ghi mới sẽ ghi đè đánh giá này/)).toBeInTheDocument();
  });

  it('submits assessment to PUT /api/profiles/:riskCode/residual/:periodKey and calls onSuccess', async () => {
    const apiSendSpy = vi.spyOn(client, 'apiSend').mockImplementation((method: unknown, path: unknown) => {
      if (typeof path === 'string' && path.includes('/periods')) {
        return Promise.resolve(mockPeriods);
      }
      if (typeof path === 'string' && path.includes('/heatmap')) {
        return Promise.resolve(null);
      }
      if (method === 'PUT') {
        return Promise.resolve({
          periodKey: '2026-Q3',
          rating: {
            impactScore: 3,
            likelihoodScore: 2,
            impactLabel: 'Trung bình',
            likelihoodLabel: 'Thấp',
            levelLabel: 'Trung bình',
          },
        });
      }
      return Promise.resolve({});
    });

    const onSuccessSpy = vi.fn();
    const onCloseSpy = vi.fn();

    render(
      <ResidualAssessmentDialog
        riskCode="HD11.R27"
        cycleYear={2026}
        residualHistory={mockResidualHistory}
        open={true}
        onClose={onCloseSpy}
        onSuccess={onSuccessSpy}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Quý 3\/2026/)).toBeInTheDocument();
    });

    // Select 2026-Q3
    const periodSelect = screen.getByLabelText(/Kỳ quý đánh giá/);
    fireEvent.change(periodSelect, { target: { value: '2026-Q3' } });

    // For 2026-Q3, no overwrite warning
    expect(screen.queryByText(/Cảnh báo ghi đè/)).not.toBeInTheDocument();

    // Change likelihood, impact, levelLabel
    const likelihoodSelect = screen.getByLabelText(/Khả năng xảy ra/);
    fireEvent.change(likelihoodSelect, { target: { value: 'Thấp' } });

    const impactSelect = screen.getByLabelText(/Mức độ ảnh hưởng/);
    fireEvent.change(impactSelect, { target: { value: 'Trung bình' } });

    const levelInput = screen.getByLabelText(/Mức rủi ro đánh giá/);
    fireEvent.change(levelInput, { target: { value: 'Trung bình' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: 'Lưu đánh giá' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/HD11.R27/residual/2026-Q3?cycle=2026',
        {
          impactLabel: 'Trung bình',
          likelihoodLabel: 'Thấp',
          levelLabel: 'Trung bình',
        },
      );
    });

    expect(onSuccessSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        periodKey: '2026-Q3',
      }),
    );
    expect(onCloseSpy).toHaveBeenCalled();
  });
});
