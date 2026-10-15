import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  bigserial,
  unique,
  primaryKey,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// 1. ENUMS (system-design 4.2, 4.4)
// ---------------------------------------------------------------------------
export const cycleStatusEnum = pgEnum('cycle_status', ['open', 'archived']);
export const periodKindEnum = pgEnum('period_kind', ['month', 'quarter', 'event']);
export const unitKindEnum = pgEnum('unit_kind', ['department', 'center', 'group']);
export const userRoleEnum = pgEnum('user_role', ['admin', 'ban4', 'unit', 'viewer']);
export const submissionStatusEnum = pgEnum('submission_status', [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
]);
export const indicatorKindEnum = pgEnum('indicator_kind', ['kri', 'kci']);
export const zoneSourceEnum = pgEnum('zone_source', ['auto', 'manual']);
export const assignmentTargetTypeEnum = pgEnum('assignment_target_type', ['control', 'indicator']);
export const indicatorUnitKindEnum = pgEnum('indicator_unit_kind', ['percent', 'count']);
export const indicatorDirectionEnum = pgEnum('indicator_direction', ['higher_is_worse', 'lower_is_worse']);

// ---------------------------------------------------------------------------
// 2. TABLES (system-design 4.2)
// ---------------------------------------------------------------------------

/**
 * 1. Chu kỳ quản lý rủi ro (hằng năm)
 */
export const cycle = pgTable('cycle', {
  id: uuid('id').primaryKey().defaultRandom(),
  year: integer('year').notNull().unique(),
  status: cycleStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 2. Đơn vị tổ chức trong MBF
 */
export const unit = pgTable('unit', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  kind: unitKindEnum('kind').notNull(),
});

/**
 * 3. Người dùng hệ thống
 */
export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull(),
  unitId: uuid('unit_id').references(() => unit.id),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 4. Kỳ báo cáo / đánh giá
 */
export const period = pgTable(
  'period',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cycle.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 50 }).notNull(),
    kind: periodKindEnum('kind').notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => appUser.id),
    reopenReason: text('reopen_reason'),
  },
  (t) => ({
    cycleKeyUnique: unique('period_cycle_id_key_unique').on(t.cycleId, t.key),
  })
);

/**
 * 5. Phiên đăng nhập người dùng
 */
export const session = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * 6. Lịch sử mật khẩu (giữ 5 bản gần nhất)
 */
export const passwordHistory = pgTable('password_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 7. Hồ sơ rủi ro trọng yếu
 */
export const riskProfile = pgTable(
  'risk_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => cycle.id, { onDelete: 'cascade' }),
    riskCode: varchar('risk_code', { length: 50 }).notNull(),
    hsrrCode: varchar('hsrr_code', { length: 100 }).notNull(),
    name: text('name').notNull(),
    riskType: varchar('risk_type', { length: 255 }).notNull(),
    riskZone: varchar('risk_zone', { length: 255 }).notNull(),
    riskGroup: varchar('risk_group', { length: 255 }).notNull(),
    owner: varchar('owner', { length: 255 }).notNull(),
    relatedActivity: text('related_activity').notNull(),
    preparedByUnit: varchar('prepared_by_unit', { length: 255 }).notNull(),
    description: text('description').notNull(),
    inherentImpact: varchar('inherent_impact', { length: 50 }).notNull(),
    inherentLikelihood: varchar('inherent_likelihood', { length: 50 }).notNull(),
    inherentLevel: varchar('inherent_level', { length: 50 }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    manuallyEditedAt: timestamp('manually_edited_at', { withTimezone: true }),
  },
  (t) => ({
    cycleRiskCodeUnique: unique('risk_profile_cycle_id_risk_code_unique').on(
      t.cycleId,
      t.riskCode
    ),
  })
);

/**
 * 8. Đánh giá rủi ro còn lại theo kỳ
 */
export const residualAssessment = pgTable(
  'residual_assessment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => riskProfile.id, { onDelete: 'cascade' }),
    periodKey: varchar('period_key', { length: 50 }).notNull(),
    impact: varchar('impact', { length: 50 }).notNull(),
    likelihood: varchar('likelihood', { length: 50 }).notNull(),
    level: varchar('level', { length: 50 }).notNull(),
    enteredBy: uuid('entered_by').references(() => appUser.id),
    enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profilePeriodKeyUnique: unique('residual_assessment_profile_id_period_key_unique').on(
      t.profileId,
      t.periodKey
    ),
  })
);

/**
 * 9. Nguyên nhân rủi ro
 */
export const cause = pgTable(
  'cause',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => riskProfile.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    causeGroup: varchar('cause_group', { length: 100 }).notNull(),
    description: text('description').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    manuallyEditedAt: timestamp('manually_edited_at', { withTimezone: true }),
  },
  (t) => ({
    profileCodeUnique: unique('cause_profile_id_code_unique').on(t.profileId, t.code),
  })
);

/**
 * 10. Ảnh hưởng rủi ro
 */
export const impact = pgTable(
  'impact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => riskProfile.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    impactGroup: varchar('impact_group', { length: 100 }).notNull(),
    description: text('description').notNull(),
    level: varchar('level', { length: 50 }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    manuallyEditedAt: timestamp('manually_edited_at', { withTimezone: true }),
  },
  (t) => ({
    profileCodeUnique: unique('impact_profile_id_code_unique').on(t.profileId, t.code),
  })
);

/**
 * 11. Biện pháp kiểm soát hiện tại
 */
export const control = pgTable(
  'control',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => riskProfile.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    description: text('description').notNull(),
    ownerText: text('owner_text').notNull(),
    frequency: varchar('frequency', { length: 100 }).notNull(),
    objective: varchar('objective', { length: 100 }).notNull(),
    method: varchar('method', { length: 100 }).notNull(),
    designEff: varchar('design_eff', { length: 100 }).notNull(),
    operatingEff: varchar('operating_eff', { length: 100 }).notNull(),
    overallEff: varchar('overall_eff', { length: 100 }).notNull(),
    needsSupplement: boolean('needs_supplement').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    manuallyEditedAt: timestamp('manually_edited_at', { withTimezone: true }),
  },
  (t) => ({
    profileCodeUnique: unique('control_profile_id_code_unique').on(t.profileId, t.code),
  })
);

/**
 * 12. Liên kết nhiều - nhiều: Kiểm soát <-> Nguyên nhân
 */
export const controlCause = pgTable(
  'control_cause',
  {
    controlId: uuid('control_id')
      .notNull()
      .references(() => control.id, { onDelete: 'cascade' }),
    causeId: uuid('cause_id')
      .notNull()
      .references(() => cause.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.controlId, t.causeId] }),
  })
);

/**
 * 13. Kế hoạch hành động ứng phó
 */
export const actionPlan = pgTable(
  'action_plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => riskProfile.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    description: text('description').notNull(),
    responsibilityText: text('responsibility_text').notNull(),
    deliverable: text('deliverable').notNull(),
    dueText: text('due_text').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    manuallyEditedAt: timestamp('manually_edited_at', { withTimezone: true }),
  },
  (t) => ({
    profileCodeUnique: unique('action_plan_profile_id_code_unique').on(t.profileId, t.code),
  })
);

/**
 * 14. Liên kết nhiều - nhiều: Kế hoạch hành động <-> Kiểm soát
 */
export const actionControl = pgTable(
  'action_control',
  {
    actionId: uuid('action_id')
      .notNull()
      .references(() => actionPlan.id, { onDelete: 'cascade' }),
    controlId: uuid('control_id')
      .notNull()
      .references(() => control.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.actionId, t.controlId] }),
  })
);

/**
 * 15. Đầu việc chi tiết của Kế hoạch hành động
 */
export const actionTask = pgTable('action_task', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionId: uuid('action_id')
    .notNull()
    .references(() => actionPlan.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  unitId: uuid('unit_id').references(() => unit.id),
  dueDate: date('due_date'),
  weight: integer('weight').notNull().default(1),
  sourceText: text('source_text'),
  sortOrder: integer('sort_order').notNull().default(0),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * 16. Cập nhật tiến độ đầu việc theo kỳ
 */
export const actionUpdate = pgTable(
  'action_update',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => actionTask.id, { onDelete: 'cascade' }),
    periodKey: varchar('period_key', { length: 50 }).notNull(),
    progress: integer('progress').notNull(), // 0 - 100
    note: text('note'),
    status: submissionStatusEnum('status').notNull().default('pending'),
    submittedBy: uuid('submitted_by').references(() => appUser.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid('reviewed_by').references(() => appUser.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
  },
  (t) => ({
    taskPeriodStatusIdx: index('action_update_task_period_status_idx').on(
      t.taskId,
      t.periodKey,
      t.status
    ),
  })
);

/**
 * 17. Chỉ số đo lường (KRI, KCI)
 */
export const indicator = pgTable(
  'indicator',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => riskProfile.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    kind: indicatorKindEnum('kind').notNull(),
    name: text('name').notNull(),
    formula: text('formula').notNull(),
    frequency: varchar('frequency', { length: 100 }).notNull(),
    periodKind: periodKindEnum('period_kind').notNull(),
    thresholdLowText: text('threshold_low_text').notNull(),
    thresholdMidText: text('threshold_mid_text').notNull(),
    thresholdHighText: text('threshold_high_text').notNull(),
    zoneRules: jsonb('zone_rules'), // null nếu chuyển thủ công
    note: text('note'),
    ownerUnitId: uuid('owner_unit_id').references(() => unit.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    manuallyEditedAt: timestamp('manually_edited_at', { withTimezone: true }),
    unitKind: indicatorUnitKindEnum('unit_kind').notNull().default('count'),
    unitLabel: text('unit_label').notNull().default('vụ việc'),
    direction: indicatorDirectionEnum('direction'),
    yellowAt: numeric('yellow_at'),
    redAt: numeric('red_at'),
    targetValue: numeric('target_value'),
  },
  (t) => ({
    profileCodeUnique: unique('indicator_profile_id_code_unique').on(t.profileId, t.code),
  })
);

/**
 * 18. Giá trị ghi nhận chỉ số theo kỳ
 */
export const indicatorReading = pgTable(
  'indicator_reading',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    indicatorId: uuid('indicator_id')
      .notNull()
      .references(() => indicator.id, { onDelete: 'cascade' }),
    periodKey: varchar('period_key', { length: 50 }).notNull(),
    valueNum: numeric('value_num'),
    valueText: text('value_text'),
    zone: varchar('zone', { length: 20 }),
    zoneSource: zoneSourceEnum('zone_source'),
    zoneNote: text('zone_note'),
    note: text('note'),
    status: submissionStatusEnum('status').notNull().default('pending'),
    submittedBy: uuid('submitted_by').references(() => appUser.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid('reviewed_by').references(() => appUser.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
  },
  (t) => ({
    indicatorPeriodStatusIdx: index('indicator_reading_indicator_period_status_idx').on(
      t.indicatorId,
      t.periodKey,
      t.status
    ),
  })
);

/**
 * 19. Phân công trách nhiệm cho đơn vị
 */
export const unitAssignment = pgTable(
  'unit_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => unit.id, { onDelete: 'cascade' }),
    targetType: assignmentTargetTypeEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
  },
  (t) => ({
    assignmentUnique: unique('unit_assignment_unit_target_unique').on(
      t.unitId,
      t.targetType,
      t.targetId
    ),
  })
);

/**
 * 20. Cấu hình hệ thống (key-value)
 */
export const appSetting = pgTable('app_setting', {
  key: varchar('key', { length: 100 }).primaryKey().notNull(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => appUser.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 21. Nhật ký hệ thống (Audit Log - Bất biến)
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    userId: uuid('user_id').references(() => appUser.id),
    action: varchar('action', { length: 100 }).notNull(),
    entity: varchar('entity', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: varchar('ip', { length: 45 }),
  },
  (t) => ({
    atEntityIdx: index('audit_log_at_entity_idx').on(t.at, t.entity),
  })
);

