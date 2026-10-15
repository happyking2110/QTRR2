import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Inject,
  Optional,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { getProfiles, getProfileDetail } from '../../server/services/queries';
import {
  createProfile,
  updateProfile,
  deleteProfile,
} from '../../server/services/profiles';
import {
  createCause,
  updateCause,
  deleteCause,
  createImpact,
  updateImpact,
  deleteImpact,
  createControl,
  updateControl,
  deleteControl,
  linkControlCauses,
  createActionPlan,
  updateActionPlan,
  deleteActionPlan,
  linkActionControls,
  createIndicator,
  updateIndicator,
  deleteIndicator,
  setIndicatorTargets,
} from '../../server/services/sub-items';
import {
  listAssignments,
  assignControlUnits,
  setIndicatorOwner,
} from '../../server/services/assignments';
import { setResidual } from '../../server/services/residuals';
import { DATABASE_DB, type DbType } from '../../server/db/client';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  cycleQuerySchema,
  riskCodeParamSchema,
  residualParamsSchema,
  residualBodySchema,
} from '../pipes/query-schemas';
import {
  createProfileRequestSchema,
  profileInputSchema,
  createCauseRequestSchema,
  causeInputSchema,
  createImpactRequestSchema,
  impactInputSchema,
  createControlRequestSchema,
  controlInputSchema,
  createActionRequestSchema,
  actionInputSchema,
  createIndicatorRequestSchema,
  indicatorInputSchema,
  indicatorTargetsInputSchema,
  linkCodesRequestSchema,
  itemCodeParamSchema,
  taskInputSchema,
} from '../pipes/plan-4a-schemas';
import { createTask } from '../../server/services/tasks';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import { getClientIp } from '../../server/config';
import type { Actor } from '../../server/types';

const controlUnitsSchema = z.object({
  unitCodes: z.array(z.string().regex(/^[A-Z0-9_]+$/)).max(20),
});

const nullableUnitSchema = z.object({
  unitCode: z.string().regex(/^[A-Z0-9_]+$/).nullable(),
});

@Roles('admin', 'ban4', 'unit', 'viewer')
@Controller('profiles')
export class ProfilesController {
  constructor(
    @Optional()
    @Inject(DATABASE_DB)
    private readonly db?: DbType
  ) {}

  @Get()
  async listProfiles(
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number; period?: string }
  ) {
    return await getProfiles(query, this.db);
  }

  @Roles('admin', 'ban4')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @Body(new ZodValidationPipe(createProfileRequestSchema))
    body: z.infer<typeof createProfileRequestSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await createProfile(body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Put(':riskCode')
  async updateProfile(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Body(new ZodValidationPipe(profileInputSchema))
    body: z.infer<typeof profileInputSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await updateProfile(params.riskCode, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Delete(':riskCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProfile(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    await deleteProfile(params.riskCode, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Get(':riskCode/assignments')
  async getAssignments(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number }
  ) {
    return await listAssignments(params.riskCode, query.cycle, this.db);
  }

  @Get(':riskCode')
  async getProfile(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number; period?: string },
    @CurrentActor() actor: Actor | null
  ) {
    return await getProfileDetail(params.riskCode, query, this.db, actor);
  }

  @Roles('admin')
  @Put(':riskCode/controls/:code/units')
  async assignControl(
    @Param('riskCode') riskCode: string,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(controlUnitsSchema))
    body: z.infer<typeof controlUnitsSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await assignControlUnits(
      riskCode,
      code,
      body.unitCodes,
      { actor, ip },
      query.cycle,
      this.db
    );
  }

  @Roles('admin')
  @Put(':riskCode/indicators/:code/owner')
  async setIndicator(
    @Param('riskCode') riskCode: string,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(nullableUnitSchema))
    body: z.infer<typeof nullableUnitSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await setIndicatorOwner(
      riskCode,
      code,
      body.unitCode,
      { actor, ip },
      query.cycle,
      this.db
    );
  }

  @Roles('admin', 'ban4')
  @Put(':riskCode/residual/:periodKey')
  @HttpCode(HttpStatus.OK)
  async setResidual(
    @Param(new ZodValidationPipe(residualParamsSchema))
    params: { riskCode: string; periodKey: string },
    @Body(new ZodValidationPipe(residualBodySchema))
    body: { impactLabel: string; likelihoodLabel: string; levelLabel: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await setResidual(
      params.riskCode,
      params.periodKey,
      body,
      query.cycle,
      actor,
      { ip },
      this.db
    );
  }

  // --- 4A.2: Nguyên nhân (causes) ---
  @Roles('admin', 'ban4')
  @Post(':riskCode/causes')
  @HttpCode(HttpStatus.CREATED)
  async createCause(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Body(new ZodValidationPipe(createCauseRequestSchema))
    body: z.infer<typeof createCauseRequestSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await createCause(params.riskCode, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Put(':riskCode/causes/:code')
  async updateCause(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(causeInputSchema))
    body: z.infer<typeof causeInputSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await updateCause(params.riskCode, itemParam.code, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Delete(':riskCode/causes/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCause(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    await deleteCause(params.riskCode, itemParam.code, query.cycle, actor, { ip }, this.db);
  }

  // --- 4A.2: Ảnh hưởng (impacts) ---
  @Roles('admin', 'ban4')
  @Post(':riskCode/impacts')
  @HttpCode(HttpStatus.CREATED)
  async createImpact(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Body(new ZodValidationPipe(createImpactRequestSchema))
    body: z.infer<typeof createImpactRequestSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await createImpact(params.riskCode, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Put(':riskCode/impacts/:code')
  async updateImpact(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(impactInputSchema))
    body: z.infer<typeof impactInputSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await updateImpact(params.riskCode, itemParam.code, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Delete(':riskCode/impacts/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImpact(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    await deleteImpact(params.riskCode, itemParam.code, query.cycle, actor, { ip }, this.db);
  }

  // --- 4A.2: Biện pháp kiểm soát (controls) ---
  @Roles('admin', 'ban4')
  @Post(':riskCode/controls')
  @HttpCode(HttpStatus.CREATED)
  async createControl(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Body(new ZodValidationPipe(createControlRequestSchema))
    body: z.infer<typeof createControlRequestSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await createControl(params.riskCode, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Put(':riskCode/controls/:code')
  async updateControl(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(controlInputSchema))
    body: z.infer<typeof controlInputSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await updateControl(params.riskCode, itemParam.code, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Delete(':riskCode/controls/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteControl(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    await deleteControl(params.riskCode, itemParam.code, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Put(':riskCode/controls/:code/causes')
  async linkControlCauses(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(linkCodesRequestSchema))
    body: z.infer<typeof linkCodesRequestSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await linkControlCauses(params.riskCode, itemParam.code, body.codes, query.cycle, actor, { ip }, this.db);
  }

  // --- 4A.2: Kế hoạch hành động (actions) ---
  @Roles('admin', 'ban4')
  @Post(':riskCode/actions')
  @HttpCode(HttpStatus.CREATED)
  async createAction(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Body(new ZodValidationPipe(createActionRequestSchema))
    body: z.infer<typeof createActionRequestSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await createActionPlan(params.riskCode, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Put(':riskCode/actions/:code')
  async updateAction(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(actionInputSchema))
    body: z.infer<typeof actionInputSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await updateActionPlan(params.riskCode, itemParam.code, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Delete(':riskCode/actions/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAction(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    await deleteActionPlan(params.riskCode, itemParam.code, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin', 'ban4')
  @Put(':riskCode/actions/:code/controls')
  async linkActionControls(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(linkCodesRequestSchema))
    body: z.infer<typeof linkCodesRequestSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await linkActionControls(params.riskCode, itemParam.code, body.codes, query.cycle, actor, { ip }, this.db);
  }

  // --- 4A.3: Đầu việc (tasks) ---
  @Roles('admin', 'ban4')
  @Post(':riskCode/actions/:code/tasks')
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(taskInputSchema))
    body: z.infer<typeof taskInputSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await createTask(params.riskCode, itemParam.code, body, query.cycle, actor, { ip }, this.db);
  }

  // --- 4A.2 & 4C.5: Chỉ số đo lường (indicators) ---
  @Roles('admin')
  @Post(':riskCode/indicators')
  @HttpCode(HttpStatus.CREATED)
  async createIndicator(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Body(new ZodValidationPipe(createIndicatorRequestSchema))
    body: z.infer<typeof createIndicatorRequestSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await createIndicator(params.riskCode, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin')
  @Put(':riskCode/indicators/:code')
  async updateIndicator(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(indicatorInputSchema))
    body: z.infer<typeof indicatorInputSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await updateIndicator(params.riskCode, itemParam.code, body, query.cycle, actor, { ip }, this.db);
  }

  @Roles('admin')
  @Put(':riskCode/indicators/:code/targets')
  async setIndicatorTargets(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Body(new ZodValidationPipe(indicatorTargetsInputSchema))
    body: z.infer<typeof indicatorTargetsInputSchema>,
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await setIndicatorTargets(
      params.riskCode,
      itemParam.code,
      body,
      query.cycle,
      actor,
      { ip },
      this.db
    );
  }

  @Roles('admin', 'ban4')
  @Delete(':riskCode/indicators/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIndicator(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Param(new ZodValidationPipe(itemCodeParamSchema))
    itemParam: { code: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    await deleteIndicator(params.riskCode, itemParam.code, query.cycle, actor, { ip }, this.db);
  }
}

