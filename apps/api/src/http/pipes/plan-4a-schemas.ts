import { z } from 'zod';

export const ratingInputSchema = z
  .object({
    impactLabel: z.string().min(1),
    likelihoodLabel: z.string().min(1),
    levelLabel: z.string().min(1).max(50),
  })
  .strict();

export const createProfileRequestSchema = z
  .object({
    riskCode: z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+$/),
    hsrrCode: z.string().min(1).max(100),
    name: z.string().min(1).max(500),
    riskType: z.string().max(255),
    riskZone: z.string().max(255),
    riskGroup: z.string().max(255),
    owner: z.string().max(255),
    relatedActivity: z.string().max(1000),
    preparedByUnit: z.string().max(255),
    description: z.string().max(10000),
    inherent: ratingInputSchema,
  })
  .strict();

export const profileInputSchema = z
  .object({
    hsrrCode: z.string().min(1).max(100),
    name: z.string().min(1).max(500),
    riskType: z.string().max(255),
    riskZone: z.string().max(255),
    riskGroup: z.string().max(255),
    owner: z.string().max(255),
    relatedActivity: z.string().max(1000),
    preparedByUnit: z.string().max(255),
    description: z.string().max(10000),
    inherent: ratingInputSchema,
  })
  .strict();

export const createCauseRequestSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/),
    group: z.string().min(1).max(100),
    description: z.string().min(1).max(10000),
  })
  .strict();

export const causeInputSchema = z
  .object({
    group: z.string().min(1).max(100),
    description: z.string().min(1).max(10000),
  })
  .strict();

export const createImpactRequestSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/),
    group: z.string().min(1).max(100),
    description: z.string().min(1).max(10000),
    level: z.string().min(1),
  })
  .strict();

export const impactInputSchema = z
  .object({
    group: z.string().min(1).max(100),
    description: z.string().min(1).max(10000),
    level: z.string().min(1),
  })
  .strict();

export const createControlRequestSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/),
    description: z.string().min(1).max(10000),
    ownerText: z.string().max(1000),
    frequency: z.string().max(100),
    objective: z.string().max(100),
    method: z.string().max(100),
    designEff: z.string().max(100),
    operatingEff: z.string().max(100),
    overallEff: z.string().max(100),
    needsSupplement: z.boolean(),
  })
  .strict();

export const controlInputSchema = z
  .object({
    description: z.string().min(1).max(10000),
    ownerText: z.string().max(1000),
    frequency: z.string().max(100),
    objective: z.string().max(100),
    method: z.string().max(100),
    designEff: z.string().max(100),
    operatingEff: z.string().max(100),
    overallEff: z.string().max(100),
    needsSupplement: z.boolean(),
  })
  .strict();

export const createActionRequestSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/),
    description: z.string().min(1).max(10000),
    responsibilityText: z.string().max(2000),
    deliverable: z.string().max(2000),
    dueText: z.string().max(500),
  })
  .strict();

export const actionInputSchema = z
  .object({
    description: z.string().min(1).max(10000),
    responsibilityText: z.string().max(2000),
    deliverable: z.string().max(2000),
    dueText: z.string().max(500),
  })
  .strict();

export const indicatorThresholdsSchema = z
  .object({
    green: z.string().min(1).max(500),
    yellow: z.string().min(1).max(500),
    red: z.string().min(1).max(500),
  })
  .strict();

export const createIndicatorRequestSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|AH|KS|KH|KRI|KCI)[0-9]{2,3}$/),
    name: z.string().min(1).max(1000),
    formula: z.string().max(2000),
    frequency: z.enum(['Tháng', 'Quý', 'Hàng quý', 'Theo đợt diễn tập']),
    thresholds: indicatorThresholdsSchema,
    note: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const indicatorInputSchema = z
  .object({
    name: z.string().min(1).max(1000),
    formula: z.string().max(2000),
    frequency: z.enum(['Tháng', 'Quý', 'Hàng quý', 'Theo đợt diễn tập']),
    thresholds: indicatorThresholdsSchema,
    note: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const indicatorTargetsInputSchema = z
  .object({
    unitKind: z.enum(['percent', 'count']),
    unitLabel: z.string().trim().min(1, 'Đơn vị không được để trống').max(20, 'Đơn vị tối đa 20 ký tự'),
    direction: z.enum(['higher_is_worse', 'lower_is_worse']).nullable(),
    yellowAt: z.number().min(0, 'Ngưỡng vàng phải >= 0').nullable(),
    redAt: z.number().min(0, 'Ngưỡng đỏ phải >= 0').nullable(),
    targetValue: z.number().min(0, 'Mục tiêu phải >= 0').nullable(),
  })
  .strict();

export const linkCodesRequestSchema = z
  .object({
    codes: z
      .array(z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+\.(NN|KS)[0-9]{2,3}$/))
      .max(50),
  })
  .strict();

export const taskInputSchema = z
  .object({
    name: z.string().min(1).max(500),
    unitCode: z.string().regex(/^[A-Z0-9_]+$/).nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .strict();

export const splitTaskRequestSchema = z
  .object({
    parts: z.array(taskInputSchema).min(2).max(20),
  })
  .strict();

export const cloneCycleRequestSchema = z
  .object({
    fromYear: z.number().int().min(2000).max(2100),
  })
  .strict();

export const itemCodeParamSchema = z.object({
  code: z.string().min(1).max(50),
});
