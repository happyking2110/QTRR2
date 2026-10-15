import { z } from 'zod';

export const cycleQuerySchema = z.object({
  cycle: z.coerce.number().int().min(2000).max(2100).optional(),
  period: z.string().regex(/^[0-9]{4}-(Q[1-4]|[0-9]{2}|E[0-9]+)$/).optional(),
});

export const yearParamSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const riskCodeParamSchema = z.object({
  riskCode: z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+$/),
});

export const indicatorIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const actionsQuerySchema = z.object({
  cycle: z.coerce.number().int().min(2000).max(2100).optional(),
  period: z.string().regex(/^[0-9]{4}-(Q[1-4]|[0-9]{2}|E[0-9]+)$/).optional(),
  riskCode: z.string().optional(),
  status: z
    .enum(['completed', 'overdue', 'at_risk', 'in_progress', 'not_started'])
    .optional(),
  unit: z.string().optional(),
  dueFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().max(200).optional(),
});

export const indicatorsQuerySchema = z.object({
  cycle: z.coerce.number().int().min(2000).max(2100).optional(),
  period: z.string().regex(/^[0-9]{4}-(Q[1-4]|[0-9]{2}|E[0-9]+)$/).optional(),
  riskCode: z.string().optional(),
  kind: z.enum(['kri', 'kci']).optional(),
  zone: z.enum(['green', 'yellow', 'red', 'none']).optional(),
  unit: z.string().optional(),
});

export const zonePreviewQuerySchema = z.object({
  value: z.coerce.number().min(0).max(100),
});

export const indicatorReadingsQuerySchema = z.object({
  period: z.string().regex(/^[0-9]{4}-(Q[1-4]|[0-9]{2}|E[0-9]+)$/).optional(),
});

export const submitReadingBodySchema = z.object({
  periodKey: z.string().min(1),
  valueNum: z.number().min(0).max(100).nullable().optional(),
  valueText: z.string().max(500).nullable().optional(),
  zone: z.enum(['green', 'yellow', 'red']).nullable().optional(),
  zoneNote: z.string().max(1000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const taskIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const submitTaskUpdateBodySchema = z.object({
  periodKey: z.string().min(1),
  progress: z.number().int().min(0).max(100),
  note: z.string().max(1000).nullable().optional(),
});
export const submissionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const rejectBodySchema = z.object({
  reason: z.string().min(5).max(500),
});

export const bulkApproveBodySchema = z.object({
  items: z
    .array(
      z.object({
        kind: z.enum(['reading', 'task_update']),
        id: z.string().uuid(),
      })
    )
    .min(1)
    .max(100),
});

export const approvalsQuerySchema = z.object({
  cycle: z.coerce.number().int().min(2000).max(2100).optional(),
  kind: z.enum(['reading', 'task_update']).optional(),
  period: z.string().regex(/^[0-9]{4}-(Q[1-4]|[0-9]{2}|E[0-9]+)$/).optional(),
  riskCode: z.string().optional(),
});

export const yearAndKeyParamSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  key: z.string().min(1),
});

export const createEventPeriodBodySchema = z.object({
  label: z.string().min(3).max(100),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const reopenPeriodBodySchema = z.object({
  reason: z.string().min(5).max(500),
});

export const settingsBodySchema = z.object({
  slowDays: z.number().int().min(1).max(365),
  slowProgress: z.number().int().min(0).max(100),
  staleDays: z.number().int().min(1).max(365),
  dueDay: z.number().int().min(1).max(28),
});

export const residualParamsSchema = z.object({
  riskCode: z.string().regex(/^[A-Z0-9]+\.[A-Z0-9]+$/),
  periodKey: z.string().regex(/^[0-9]{4}-Q[1-4]$/),
});

export const residualBodySchema = z.object({
  impactLabel: z.string().min(1),
  likelihoodLabel: z.string().min(1),
  levelLabel: z.string().min(1).max(50),
});

export const auditQuerySchema = z.object({
  actor: z.string().max(100).optional(),
  entity: z.string().max(100).optional(),
  action: z.string().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().regex(/^[0-9]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

