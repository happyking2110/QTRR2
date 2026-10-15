import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { HeatMatrix } from './HeatMatrix';
import type { components } from '@/lib/api/schema';

type HeatmapPoint = components['schemas']['HeatmapPoint'];

const mockPoints: HeatmapPoint[] = [
  {
    riskCode: 'HD11.R27',
    name: 'Rủi ro 27',
    inherent: {
      impactScore: 5,
      likelihoodScore: 4,
      impactLabel: 'Nghiêm trọng',
      likelihoodLabel: 'Nhiều khả năng xảy ra',
      levelLabel: 'Cực kỳ nghiêm trọng',
    },
    residual: {
      impactScore: 4,
      likelihoodScore: 3,
      impactLabel: 'Lớn',
      likelihoodLabel: 'Có thể xảy ra',
      levelLabel: 'Cao',
    },
  },
  {
    riskCode: 'CN02.R13',
    name: 'Rủi ro 13',
    inherent: {
      impactScore: 5,
      likelihoodScore: 4,
      impactLabel: 'Nghiêm trọng',
      likelihoodLabel: 'Nhiều khả năng xảy ra',
      levelLabel: 'Cực kỳ nghiêm trọng',
    },
    residual: null,
  },
  {
    riskCode: 'TT07.R46',
    name: 'Rủi ro 46',
    inherent: {
      impactScore: 5,
      likelihoodScore: 3,
      impactLabel: 'Nghiêm trọng',
      likelihoodLabel: 'Có thể xảy ra',
      levelLabel: 'Cao',
    },
    residual: null,
  },
];

describe('HeatMatrix component', () => {
  it('places profiles at correct cells after axis inversion (Likelihood vertical, Impact horizontal)', () => {
    // Render in inherent mode
    render(
      <HeatMatrix
        points={mockPoints}
        defaultMode="inherent"
        scaleProvisional={true}
      />,
    );

    // Full codes are displayed in matrix cells
    const cell45 = screen.getByTestId('matrix-cell-4-5');
    expect(within(cell45).getByText('HD11.R27')).toBeInTheDocument();
    expect(within(cell45).getByText('CN02.R13')).toBeInTheDocument();

    // Likelihood 3, Impact 5: TT07.R46
    const cell35 = screen.getByTestId('matrix-cell-3-5');
    expect(within(cell35).getByText('TT07.R46')).toBeInTheDocument();
  });

  it('switches between residual and inherent mode and handles missing residual profiles', () => {
    // Default mode is residual because HD11.R27 has residual assessment
    render(<HeatMatrix points={mockPoints} scaleProvisional={true} />);

    // In residual mode: HD11.R27 is at Likelihood 3, Impact 4
    const cell34 = screen.getByTestId('matrix-cell-3-4');
    expect(within(cell34).getByText('HD11.R27')).toBeInTheDocument();

    // CN02.R13 and TT07.R46 have no residual assessment, so they appear in missing residual note
    expect(screen.getByText(/Chưa nhập mức còn lại:/).parentElement).toHaveTextContent(
      'CN02.R13, TT07.R46',
    );

    // Click "Rủi ro tiềm ẩn" button to switch mode
    const inherentBtn = screen.getByRole('button', { name: 'Rủi ro tiềm ẩn' });
    fireEvent.click(inherentBtn);

    // Now in inherent mode: cell 4-5 has HD11.R27 and CN02.R13
    const cell45 = screen.getByTestId('matrix-cell-4-5');
    expect(within(cell45).getByText('HD11.R27')).toBeInTheDocument();
    expect(within(cell45).getByText('CN02.R13')).toBeInTheDocument();
  });

  it('renders screen reader accessible table with all profile rows', () => {
    render(<HeatMatrix points={mockPoints} scaleProvisional={true} />);

    const srTable = screen.getByRole('table', { hidden: true });
    expect(srTable).toBeInTheDocument();
    expect(within(srTable).getByText('HD11.R27')).toBeInTheDocument();
    expect(within(srTable).getByText('CN02.R13')).toBeInTheDocument();
    expect(within(srTable).getByText('TT07.R46')).toBeInTheDocument();
  });

  it('renders provisional scale banner when scaleProvisional is true', () => {
    render(<HeatMatrix points={mockPoints} scaleProvisional={true} />);
    expect(
      screen.getByText('Thang 5 mức tạm thời, đang chờ Ban 4 xác nhận'),
    ).toBeInTheDocument();
  });
});
