import type { components } from './schema';

type Overview = components['schemas']['Overview'];
type ProfileDetail = components['schemas']['ProfileDetail'];
type ActionTask = components['schemas']['ActionTask'];
type Indicator = components['schemas']['Indicator'];

// 1. Kiểm tra ActionTask với unit: null và dueDate: null kèm trường 3B mới
export const validActionTask: ActionTask = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Đầu việc mẫu',
  unit: null,
  dueDate: null,
  weight: 1,
  progress: 0,
  sourceText: null,
  lastApprovedUpdateAt: null,
  submitPeriodKeys: ['2026-Q4'],
  pendingSubmissions: [],
};

// 2. Kiểm tra Indicator với current: null kèm trường 3B và 4C mới
export const validIndicator: Indicator = {
  id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  code: 'CN02.R13.KRI01',
  kind: 'kri',
  name: 'Chỉ số đo lường rủi ro',
  formula: 'Công thức đo lường',
  frequency: 'Hàng quý',
  periodKind: 'quarter',
  unitKind: 'percent',
  unitLabel: '%',
  direction: 'lower_is_worse',
  yellowAt: 5,
  redAt: 10,
  targetValue: null,
  targetProgress: null,
  dataSource: null,
  thresholds: {
    green: '< 5%',
    yellow: '5% - 10%',
    red: '> 10%',
  },
  mode: 'auto',
  ownerUnit: null,
  note: null,
  current: null,
  submitPeriodKeys: ['2026-Q4'],
  pendingSubmissions: [],
};

// 3. Kiểm tra Overview hợp lệ
export const validOverview: Overview = {
  cycle: {
    year: 2026,
    status: 'open',
  },
  period: null,
  hasApprovedData: false,
  asOfDate: null,
  profileCount: 4,
  kri: { total: 9, red: 0, yellow: 0, green: 0, noData: 9 },
  kci: { total: 12, red: 0, yellow: 0, green: 0, noData: 12 },
  actions: { total: 10, completed: 0, inProgress: 0, notStarted: 10, atRisk: 0, overdue: 0 },
  actionProgressAverage: null,
};

// 4. Kiểm tra ProfileDetail hợp lệ
export const validProfileDetail: ProfileDetail = {
  profile: {
    riskCode: 'HD11.R27',
    hsrrCode: 'HSRRTY_MBF_2026_HD11.R27',
    name: 'Rủi ro bảo mật thông tin',
    riskType: 'Rủi ro hoạt động',
    riskZone: 'Khối Cơ quan Tổng công ty',
    riskGroup: 'Công nghệ thông tin',
    owner: 'Ban Công nghệ thông tin',
    inherent: {
      impactScore: 5,
      likelihoodScore: 4,
      score: 20,
      impactLabel: 'Nghiêm trọng',
      likelihoodLabel: 'Nhiều khả năng xảy ra',
      levelLabel: 'Cực kỳ nghiêm trọng',
    },
    residual: null,
    kri: { total: 3, red: 0, yellow: 0, green: 0, noData: 3 },
    kci: { total: 3, red: 0, yellow: 0, green: 0, noData: 3 },
    actions: { total: 3, completed: 0, inProgress: 0, notStarted: 3, atRisk: 0, overdue: 0 },
    actionProgress: null,
  },
  period: null,
  description: 'Mô tả rủi ro chi tiết\n- Gạch đầu dòng 1\n- Gạch đầu dòng 2',
  relatedActivity: 'Hoạt động vận hành mạng lưới',
  preparedByUnit: 'Ban Công nghệ',
  causes: [],
  impacts: [],
  controls: [],
  actions: [],
  indicators: [],
  residualHistory: [],
};

// 5. Kiểm tra @ts-expect-error thực sự bắt lỗi khi gán kiểu sai
// @ts-expect-error Chuỗi không thể gán cho ActionTask
export const invalidActionTask: ActionTask = 'không phải ActionTask';

// 6. Kiểm tra các kiểu của Kế hoạch 3A
type CurrentUser = components['schemas']['CurrentUser'];
type UserListItem = components['schemas']['UserListItem'];
type CreatedUser = components['schemas']['CreatedUser'];
type ImportUsersResult = components['schemas']['ImportUsersResult'];
type Assignments = components['schemas']['Assignments'];

export const validCurrentUser: CurrentUser = {
  id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  email: 'admin@mobifone.vn',
  fullName: 'Quản trị viên hệ thống',
  role: 'admin',
  unit: null,
  mustChangePassword: false,
};

export const validUserListItem: UserListItem = {
  id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
  email: 'user_cntt@mobifone.vn',
  fullName: 'Chuyên viên CNTT',
  role: 'unit',
  unit: {
    code: 'CNTT',
    name: 'Ban Công nghệ thông tin',
    kind: 'department',
  },
  isActive: true,
  mustChangePassword: false,
  lockedUntil: null,
  lastLoginAt: '2026-10-12T08:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
};

export const validCreatedUser: CreatedUser = {
  user: validUserListItem,
  temporaryPassword: 'TempPassword123!',
};

export const validImportUsersResult: ImportUsersResult = {
  created: [
    {
      email: 'user1@mobifone.vn',
      fullName: 'Người 1',
      role: 'ban4',
      temporaryPassword: 'P1!',
    },
  ],
};

export const validAssignments: Assignments = {
  riskCode: 'HD11.R27',
  controls: [],
  indicators: [],
  tasks: [],
};

// 7. Kiểm tra các kiểu của Kế hoạch 3B (W1)
type PeriodSummary = components['schemas']['PeriodSummary'];
type ReadingSubmission = components['schemas']['ReadingSubmission'];
type TaskUpdateSubmission = components['schemas']['TaskUpdateSubmission'];
type ReadingApprovalItem = components['schemas']['ReadingApprovalItem'];
type TaskUpdateApprovalItem = components['schemas']['TaskUpdateApprovalItem'];
type ApprovalItem = components['schemas']['ApprovalItem'];
type Settings = components['schemas']['Settings'];
type AuditPage = components['schemas']['AuditPage'];

// 7.1 PeriodSummary với trường mới (closedAt, closedByName, reopenReason)
export const validPeriodSummary: PeriodSummary = {
  key: '2026-10',
  kind: 'month',
  label: 'Tháng 10/2026',
  startsOn: '2026-10-01',
  endsOn: '2026-10-31',
  dueAt: '2026-11-10T16:59:59.000Z',
  closed: false,
  closedAt: null,
  closedByName: null,
  reopenReason: null,
};

// 7.2 ReadingSubmission
export const validReadingSubmission: ReadingSubmission = {
  id: 'e12d464a-0a46-489b-b8db-9edfac867dad',
  indicatorId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  indicatorCode: 'CN02.R13.KRI01',
  periodKey: '2026-10',
  valueNum: 7.5,
  valueText: null,
  zone: 'yellow',
  zoneSource: 'auto',
  zoneNote: null,
  note: 'Nộp số liệu kỳ 2026-10',
  status: 'pending',
  submittedBy: { fullName: 'Người dùng TT1', unitName: 'TT1' },
  submittedAt: '2026-10-13T05:46:42.218Z',
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
};

// 7.3 TaskUpdateSubmission
export const validTaskUpdateSubmission: TaskUpdateSubmission = {
  id: '8499afce-93e2-439e-bf67-ba3e0172f6d8',
  taskId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  actionCode: 'HD11.R27.KH01',
  taskName: 'Toàn bộ kế hoạch',
  periodKey: '2026-Q4',
  progress: 30,
  note: 'Tiến độ quý 4 đạt 30%',
  status: 'pending',
  submittedBy: { fullName: 'Người dùng TT1', unitName: 'TT1' },
  submittedAt: '2026-10-13T06:04:38.679Z',
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
};

// 7.4 ApprovalItem (nhánh reading)
export const validReadingApprovalItem: ReadingApprovalItem = {
  kind: 'reading',
  riskCode: 'HD11.R27',
  targetName: 'Tỷ lệ hệ thống CNTT đáp ứng tiêu chuẩn',
  submission: validReadingSubmission,
  current: {
    periodKey: '2026-09',
    valueNum: 4,
    valueText: null,
    zone: 'green',
    zoneSource: 'auto',
    reviewedAt: '2026-10-01T08:00:00.000Z',
  },
  canApprove: true,
};

// 7.5 ApprovalItem (nhánh task_update)
export const validTaskUpdateApprovalItem: TaskUpdateApprovalItem = {
  kind: 'task_update',
  riskCode: 'HD11.R27',
  targetName: 'Nâng cấp hệ thống giám sát an toàn thông tin',
  submission: validTaskUpdateSubmission,
  currentProgress: 20,
  canApprove: true,
};

// 7.6 ApprovalItem (union)
export const validApprovalBranch1: ApprovalItem = validReadingApprovalItem;
export const validApprovalBranch2: ApprovalItem = validTaskUpdateApprovalItem;

// 7.7 Settings
export const validSettings: Settings = {
  slowDays: 30,
  slowProgress: 10,
  staleDays: 60,
  dueDay: 10,
};

// 7.8 AuditPage
export const validAuditPage: AuditPage = {
  items: [
    {
      id: '101',
      at: '2026-10-13T08:00:00.000Z',
      user: { fullName: 'Quản trị viên 1', email: 'admin@mobifone.vn' },
      action: 'approve_reading',
      entity: 'indicator_reading',
      entityId: 'e12d464a-0a46-489b-b8db-9edfac867dad',
      before: { status: 'pending' },
      after: { status: 'approved' },
      ip: '127.0.0.1',
    },
  ],
  nextCursor: null,
};

// 8. Kiểm tra các kiểu của Kế hoạch 4A (W1)
type RatingInput = components['schemas']['RatingInput'];
type CreateProfileRequest = components['schemas']['CreateProfileRequest'];
type ProfileInput = components['schemas']['ProfileInput'];
type CreateCauseRequest = components['schemas']['CreateCauseRequest'];
type CauseInput = components['schemas']['CauseInput'];
type CreateImpactRequest = components['schemas']['CreateImpactRequest'];
type ImpactInput = components['schemas']['ImpactInput'];
type CreateControlRequest = components['schemas']['CreateControlRequest'];
type ControlInput = components['schemas']['ControlInput'];
type CreateActionRequest = components['schemas']['CreateActionRequest'];
type ActionInput = components['schemas']['ActionInput'];
type CreateIndicatorRequest = components['schemas']['CreateIndicatorRequest'];
type IndicatorInput = components['schemas']['IndicatorInput'];
type LinkCodesRequest = components['schemas']['LinkCodesRequest'];
type TaskInput = components['schemas']['TaskInput'];
type SplitTaskRequest = components['schemas']['SplitTaskRequest'];
type ImportIssue = components['schemas']['ImportIssue'];
type ImportCycleReport = components['schemas']['ImportCycleReport'];
type CloneCycleRequest = components['schemas']['CloneCycleRequest'];

export const validRatingInput: RatingInput = {
  impactLabel: 'Nghiêm trọng',
  likelihoodLabel: 'Nhiều khả năng xảy ra',
  levelLabel: 'Cao',
};

export const validCreateProfileRequest: CreateProfileRequest = {
  riskCode: 'HD11.R28',
  hsrrCode: 'HSRRTY_MBF_2026_HD11.R28',
  name: 'Rủi ro gián đoạn dịch vụ CNTT',
  riskType: 'Rủi ro vận hành',
  riskZone: 'Khối Cơ quan Tổng công ty',
  riskGroup: 'Hạ tầng mạng lưới',
  owner: 'Ban Công nghệ thông tin',
  relatedActivity: 'Vận hành hệ thống',
  preparedByUnit: 'Ban CNTT',
  description: 'Mô tả chi tiết rủi ro',
  inherent: validRatingInput,
};

export const validProfileInput: ProfileInput = {
  hsrrCode: 'HSRRTY_MBF_2026_HD11.R28',
  name: 'Rủi ro gián đoạn dịch vụ CNTT đã sửa',
  riskType: 'Rủi ro vận hành',
  riskZone: 'Khối Cơ quan Tổng công ty',
  riskGroup: 'Hạ tầng mạng lưới',
  owner: 'Ban Công nghệ thông tin',
  relatedActivity: 'Vận hành hệ thống',
  preparedByUnit: 'Ban CNTT',
  description: 'Mô tả chi tiết rủi ro đã sửa',
  inherent: validRatingInput,
};

export const validCreateCauseRequest: CreateCauseRequest = {
  code: 'HD11.R27.NN06',
  group: 'Hệ thống',
  description: 'Lỗi phần cứng máy chủ trung tâm',
};

export const validCauseInput: CauseInput = {
  group: 'Hệ thống',
  description: 'Lỗi phần cứng máy chủ trung tâm cập nhật',
};

export const validCreateImpactRequest: CreateImpactRequest = {
  code: 'HD11.R27.AH04',
  group: 'Tài chính',
  description: 'Thiệt hại doanh thu do gián đoạn',
  level: 'Nghiêm trọng',
};

export const validImpactInput: ImpactInput = {
  group: 'Tài chính',
  description: 'Thiệt hại doanh thu do gián đoạn cập nhật',
  level: 'Rất nghiêm trọng',
};

export const validCreateControlRequest: CreateControlRequest = {
  code: 'HD11.R27.KS05',
  description: 'Kiểm tra bảo dưỡng định kỳ',
  ownerText: 'Ban CNTT',
  frequency: 'Hàng tháng',
  objective: 'Phòng ngừa',
  method: 'Tự động',
  designEff: 'Hiệu quả',
  operatingEff: 'Hiệu quả',
  overallEff: 'Hiệu quả',
  needsSupplement: false,
};

export const validControlInput: ControlInput = {
  description: 'Kiểm tra bảo dưỡng định kỳ cập nhật',
  ownerText: 'Ban CNTT',
  frequency: 'Hàng quý',
  objective: 'Phát hiện',
  method: 'Thủ công',
  designEff: 'Hiệu quả một phần',
  operatingEff: 'Hiệu quả',
  overallEff: 'Hiệu quả một phần',
  needsSupplement: true,
};

export const validCreateActionRequest: CreateActionRequest = {
  code: 'HD11.R27.KH03',
  description: 'Nâng cấp cụm máy chủ dự phòng',
  responsibilityText: 'Ban CNTT chủ trì',
  deliverable: 'Cụm máy chủ mới nghiệm thu đưa vào vận hành',
  dueText: '31/12/2026',
};

export const validActionInput: ActionInput = {
  description: 'Nâng cấp cụm máy chủ dự phòng cập nhật',
  responsibilityText: 'Ban CNTT chủ trì, TT Mạng lưới phối hợp',
  deliverable: 'Biên bản nghiệm thu',
  dueText: 'Quý 4/2026',
};

export const validCreateIndicatorRequest: CreateIndicatorRequest = {
  code: 'HD11.R27.KRI04',
  name: 'Tỷ lệ thời gian gián đoạn dịch vụ',
  formula: 'Tổng thời gian gián đoạn / Tổng thời gian vận hành',
  frequency: 'Tháng',
  thresholds: {
    green: '< 0.01%',
    yellow: '0.01% - 0.05%',
    red: '> 0.05%',
  },
  note: 'Chỉ số đo lường độ khả dụng',
};

export const validIndicatorInput: IndicatorInput = {
  name: 'Tỷ lệ thời gian gián đoạn dịch vụ cập nhật',
  formula: 'Tổng thời gian gián đoạn / Tổng thời gian vận hành',
  frequency: 'Hàng quý',
  thresholds: {
    green: '< 0.02%',
    yellow: '0.02% - 0.1%',
    red: '> 0.1%',
  },
  note: null,
};

export const validLinkCodesRequest: LinkCodesRequest = {
  codes: ['HD11.R27.KS01', 'HD11.R27.KS02'],
};

export const validTaskInput: TaskInput = {
  name: 'Khảo sát hiện trạng máy chủ',
  unitCode: 'BAN4',
  dueDate: '2026-11-30',
};

export const validSplitTaskRequest: SplitTaskRequest = {
  parts: [
    {
      name: 'Phần 1: Khảo sát máy chủ cơ quan',
      unitCode: 'BAN4',
      dueDate: '2026-11-15',
    },
    {
      name: 'Phần 2: Khảo sát máy chủ trung tâm',
      unitCode: 'TT1',
      dueDate: '2026-11-30',
    },
  ],
};

export const validImportIssue: ImportIssue = {
  level: 'warning',
  code: 'LINK_ONE_SIDED',
  message: 'Liên kết một chiều giữa NN và KS',
  ref: 'HD11.R27.NN01',
};

export const validImportCycleReport: ImportCycleReport = {
  year: 2026,
  counts: {
    profiles: 4,
    causes: 20,
    impacts: 15,
    controls: 18,
    actions: 12,
    tasksCreated: 15,
    kri: 9,
    kci: 12,
    periodsCreated: 7,
  },
  issues: [validImportIssue],
};

export const validCloneCycleRequest: CloneCycleRequest = {
  fromYear: 2026,
};


