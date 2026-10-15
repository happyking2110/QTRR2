/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileDetailView from './ProfileDetailView';
import { ProfileFormDrawer } from '@/components/domain/ProfileFormDrawer';
import { CauseFormDrawer } from '@/components/domain/CauseFormDrawer';
import { ImpactFormDrawer } from '@/components/domain/ImpactFormDrawer';
import { ControlFormDrawer } from '@/components/domain/ControlFormDrawer';
import { ActionFormDrawer } from '@/components/domain/ActionFormDrawer';
import { IndicatorFormDrawer } from '@/components/domain/IndicatorFormDrawer';
import { TaskFormDialog } from '@/components/domain/TaskFormDialog';
import { ResidualAssessmentDialog } from '@/components/domain/ResidualAssessmentDialog';
import type { components } from '@/lib/api/schema';
import * as clientApi from '@/lib/api/client';

type ProfileDetail = components['schemas']['ProfileDetail'];

const mockDetail: ProfileDetail = {
  profile: {
    riskCode: 'HD11.R27',
    hsrrCode: 'HSRRTY_MBF_2026_HD11.R27',
    name: 'Rủi ro ATTT',
    riskType: 'Vận hành',
    riskZone: 'Khối Cơ quan',
    riskGroup: 'CNTT',
    owner: 'Ban CNTT',
    inherent: {
      impactScore: 5,
      likelihoodScore: 4,
      impactLabel: 'Nghiêm trọng',
      likelihoodLabel: 'Nhiều khả năng xảy ra',
      levelLabel: 'Cực kỳ nghiêm trọng',
    },
    residual: null,
    kri: { total: 1, red: 0, yellow: 0, green: 0, noData: 1 },
    kci: { total: 0, red: 0, yellow: 0, green: 0, noData: 0 },
    actions: { total: 1, completed: 0, inProgress: 0, notStarted: 1, atRisk: 0, overdue: 0 },
    actionProgress: null,
  },
  period: { key: '2026-Q4', label: 'Quý 4/2026', kind: 'quarter', year: 2026, closed: false, dueDay: 15 },
  description: 'Mô tả',
  relatedActivity: 'Hoạt động',
  preparedByUnit: 'Ban CNTT',
  causes: [{ code: 'HD11.R27.NN01', group: 'Hệ thống', description: 'Nguyên nhân 1', controlCodes: [] }],
  impacts: [{ code: 'HD11.R27.AH01', group: 'Hoạt động', description: 'Ảnh hưởng 1', level: 'Lớn' }],
  controls: [{
    code: 'HD11.R27.KS01',
    description: 'Kiểm soát 1',
    ownerText: 'Ban CNTT',
    units: [],
    frequency: 'Tháng',
    objective: 'Phòng ngừa',
    method: 'Thủ công',
    designEff: 'Hiệu quả',
    operatingEff: 'Hiệu quả',
    overallEff: 'Hiệu quả',
    needsSupplement: false,
    actionCodes: [],
    causeCodes: [],
  }],
  actions: [{
    code: 'HD11.R27.KH01',
    description: 'Kế hoạch 1',
    responsibilityText: 'Ban CNTT',
    deliverable: 'Báo cáo',
    dueText: 'Quý 4/2026',
    dueDate: null,
    controlCodes: [],
    status: 'not_started',
    progress: 0,
    tasks: [],
  }],
  indicators: [{
    id: 'kri-1',
    code: 'HD11.R27.KRI01',
    kind: 'kri',
    name: 'Chỉ số 1',
    formula: 'A/B',
    frequency: 'month',
    thresholds: { green: '<= 1', yellow: '1-2', red: '> 2' },
    mode: 'auto',
    ownerUnit: null,
    note: null,
    current: null,
    submitPeriodKeys: [],
    pendingSubmissions: [],
  }],
  residualHistory: [],
};

const adminUser: components['schemas']['CurrentUser'] = {
  id: 'admin-1',
  email: 'admin@mbf.local',
  fullName: 'Admin',
  role: 'admin',
  unit: null,
  mustChangePassword: false,
};

let currentCycleParam = '2026';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/profiles/HD11.R27',
  useSearchParams: () => new URLSearchParams(`cycle=${currentCycleParam}`),
}));

describe('S1: Profile write operations must include active cycle in URL', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    currentCycleParam = '2026';
  });

  it('ProfileDetailView delete profile passes active cycle parameter (2026)', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);
    render(<ProfileDetailView detail={mockDetail} currentUser={adminUser} />);

    fireEvent.click(screen.getByTestId('delete-profile-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'DELETE',
        expect.stringMatching(/\/api\/profiles\/HD11\.R27\?cycle=2026/),
      );
    });
  });

  it('ProfileDetailView delete cause passes active cycle parameter (2026)', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);
    render(<ProfileDetailView detail={mockDetail} currentUser={adminUser} />);

    fireEvent.click(screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i }));
    fireEvent.click(screen.getByTitle('Xóa nguyên nhân'));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'DELETE',
        expect.stringMatching(/\/api\/profiles\/HD11\.R27\/causes\/HD11\.R27\.NN01\?cycle=2026/),
      );
    });
  });

  it('ProfileDetailView delete impact passes active cycle parameter (2026)', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);
    render(<ProfileDetailView detail={mockDetail} currentUser={adminUser} />);

    fireEvent.click(screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i }));
    fireEvent.click(screen.getByTitle('Xóa ảnh hưởng'));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'DELETE',
        expect.stringMatching(/\/api\/profiles\/HD11\.R27\/impacts\/HD11\.R27\.AH01\?cycle=2026/),
      );
    });
  });

  it('ProfileDetailView delete control passes active cycle parameter (2026)', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);
    render(<ProfileDetailView detail={mockDetail} currentUser={adminUser} />);

    fireEvent.click(screen.getByRole('button', { name: /Chi tiết theo biểu mẫu BM06/i }));
    fireEvent.click(screen.getByTitle('Xóa kiểm soát'));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'DELETE',
        expect.stringMatching(/\/api\/profiles\/HD11\.R27\/controls\/HD11\.R27\.KS01\?cycle=2026/),
      );
    });
  });

  it('ProfileDetailView delete action passes active cycle parameter (2026)', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);
    render(<ProfileDetailView detail={mockDetail} currentUser={adminUser} />);

    fireEvent.click(screen.getByTitle('Xóa kế hoạch'));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'DELETE',
        expect.stringMatching(/\/api\/profiles\/HD11\.R27\/actions\/HD11\.R27\.KH01\?cycle=2026/),
      );
    });
  });

  it('ProfileDetailView delete indicator passes active cycle parameter (2026)', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);
    render(<ProfileDetailView detail={mockDetail} currentUser={adminUser} />);

    fireEvent.click(screen.getByTitle('Xóa KRI'));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'DELETE',
        expect.stringMatching(/\/api\/profiles\/HD11\.R27\/indicators\/HD11\.R27\.KRI01\?cycle=2026/),
      );
    });
  });

  it('ProfileFormDrawer passes cycle query when submitting PUT', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <ProfileFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        cycle={2026}
        initialProfile={{
          riskCode: 'HD11.R27',
          name: 'Rủi ro ATTT',
          hsrrCode: 'HSRRTY_MBF_HD11.R27',
          riskType: 'Vận hành',
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

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/HD11.R27?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('ProfileFormDrawer passes cycle query when submitting POST', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <ProfileFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        heatmap={{
          impactLevels: [{ score: 1, label: 'Thấp' }],
          likelihoodLevels: [{ score: 1, label: 'Thấp' }],
        } as any}
        cycle={2026}
        initialProfile={null}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Mã rủi ro/i), { target: { value: 'HD11.R99' } });
    fireEvent.change(screen.getByLabelText(/Tên rủi ro/i), { target: { value: 'Rủi ro mới' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm hồ sơ/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/profiles?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('CauseFormDrawer passes cycle query when submitting POST', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <CauseFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        suggestedCode="HD11.R27.NN06"
        cycle={2026}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Mô tả nguyên nhân/i), { target: { value: 'Nguyên nhân thử nghiệm' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm nguyên nhân/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/profiles/HD11.R27/causes?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('CauseFormDrawer passes cycle query when submitting PUT', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <CauseFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        initialCause={{ code: 'HD11.R27.NN01', group: 'Hệ thống', description: 'Nguyên nhân cũ' }}
        cycle={2026}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/HD11.R27/causes/HD11.R27.NN01?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('ImpactFormDrawer passes cycle query when submitting POST', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <ImpactFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        suggestedCode="HD11.R27.AH02"
        cycle={2026}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Mô tả ảnh hưởng/i), { target: { value: 'Ảnh hưởng thử nghiệm' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm ảnh hưởng/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/profiles/HD11.R27/impacts?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('ImpactFormDrawer passes cycle query when submitting PUT', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <ImpactFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        initialImpact={{ code: 'HD11.R27.AH01', group: 'Hoạt động', description: 'Ảnh hưởng cũ', level: 'Lớn' }}
        cycle={2026}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/HD11.R27/impacts/HD11.R27.AH01?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('ControlFormDrawer passes cycle query when submitting POST', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <ControlFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        suggestedCode="HD11.R27.KS02"
        cycle={2026}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Mô tả kiểm soát/i), { target: { value: 'Kiểm soát mới' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm kiểm soát/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/profiles/HD11.R27/controls?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('ControlFormDrawer passes cycle query when submitting PUT', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <ControlFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        initialControl={{
          code: 'HD11.R27.KS01',
          description: 'Kiểm soát 1',
          ownerText: 'Ban CNTT',
          frequency: 'Tháng',
          objective: 'Phòng ngừa',
          method: 'Thủ công',
          designEff: 'Hiệu quả',
          operatingEff: 'Hiệu quả',
          overallEff: 'Hiệu quả',
          needsSupplement: false,
        }}
        cycle={2026}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/HD11.R27/controls/HD11.R27.KS01?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('ActionFormDrawer passes cycle query when submitting POST', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <ActionFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        suggestedCode="HD11.R27.KH02"
        cycle={2026}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Mô tả kế hoạch/i), { target: { value: 'Kế hoạch mới' } });
    fireEvent.change(screen.getByLabelText(/Thời hạn hoàn thành/i), { target: { value: 'Quý 4/2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm kế hoạch/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/profiles/HD11.R27/actions?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('ActionFormDrawer passes cycle query when submitting PUT', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <ActionFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        initialAction={{
          code: 'HD11.R27.KH01',
          description: 'Kế hoạch 1',
          responsibilityText: 'Ban CNTT',
          deliverable: 'Báo cáo',
          dueText: 'Quý 4/2026',
        }}
        cycle={2026}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/HD11.R27/actions/HD11.R27.KH01?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('IndicatorFormDrawer passes cycle query when submitting POST', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <IndicatorFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        kind="kri"
        suggestedCode="HD11.R27.KRI02"
        cycle={2026}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Tên chỉ số/i), { target: { value: 'Chỉ số mới' } });
    fireEvent.change(screen.getByLabelText(/Cách đo lường/i), { target: { value: 'X/Y' } });
    fireEvent.change(screen.getByLabelText(/Vùng Xanh/i), { target: { value: '<= 1' } });
    fireEvent.change(screen.getByLabelText(/Vùng Vàng/i), { target: { value: '1-2' } });
    fireEvent.change(screen.getByLabelText(/Vùng Đỏ/i), { target: { value: '> 2' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm chỉ số/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/profiles/HD11.R27/indicators?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('IndicatorFormDrawer passes cycle query when submitting PUT', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <IndicatorFormDrawer
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        kind="kri"
        initialIndicator={{
          code: 'HD11.R27.KRI01',
          name: 'Chỉ số 1',
          formula: 'A/B',
          frequency: 'Tháng',
          thresholds: { green: '<= 1', yellow: '1-2', red: '> 2' },
          note: null,
        }}
        cycle={2026}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/HD11.R27/indicators/HD11.R27.KRI01?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('TaskFormDialog passes cycle query when adding a task', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(
      <TaskFormDialog
        open={true}
        onOpenChange={vi.fn()}
        riskCode="HD11.R27"
        actionCode="HD11.R27.KH01"
        cycle={2026}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Tên đầu việc/i), { target: { value: 'Đầu việc mới' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm đầu việc/i }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'POST',
        '/api/profiles/HD11.R27/actions/HD11.R27.KH01/tasks?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('ResidualAssessmentDialog passes cycle query when submitting PUT', async () => {
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockImplementation(async (method, path) => {
      if (method === 'GET' && path.includes('/periods')) {
        return [{ key: '2026-Q4', label: 'Quý 4/2026', kind: 'quarter', year: 2026, closed: false, dueDay: 15 }];
      }
      if (method === 'GET' && path.includes('/heatmap')) {
        return {
          likelihoodLevels: [{ score: 1, label: 'Thấp' }],
          impactLevels: [{ score: 1, label: 'Thấp' }],
        };
      }
      return {} as any;
    });

    render(
      <ResidualAssessmentDialog
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        riskCode="HD11.R27"
        cycleYear={2026}
        residualHistory={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Quý 4\/2026/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu đánh giá' }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'PUT',
        '/api/profiles/HD11.R27/residual/2026-Q4?cycle=2026',
        expect.anything(),
      );
    });
  });

  it('All operations pass cycle 2027 when cycle 2027 is active', async () => {
    currentCycleParam = '2027';
    const apiSendSpy = vi.spyOn(clientApi, 'apiSend').mockResolvedValue({} as any);

    render(<ProfileDetailView detail={mockDetail} currentUser={adminUser} />);

    fireEvent.click(screen.getByTestId('delete-profile-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(apiSendSpy).toHaveBeenCalledWith(
        'DELETE',
        expect.stringMatching(/\/api\/profiles\/HD11\.R27\?cycle=2027/),
      );
    });
  });
});
