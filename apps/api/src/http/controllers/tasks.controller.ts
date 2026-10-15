import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  Inject,
  Optional,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { setTaskUnit } from '../../server/services/assignments';
import {
  submitTaskUpdate,
  getTaskUpdates,
  updateTask,
  deleteTask,
  splitTask,
  type SubmitTaskUpdatePayload,
} from '../../server/services/tasks';
import { DATABASE_DB, type DbType } from '../../server/db/client';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  taskIdParamSchema,
  submitTaskUpdateBodySchema,
} from '../pipes/query-schemas';
import { taskInputSchema, splitTaskRequestSchema } from '../pipes/plan-4a-schemas';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import { getClientIp } from '../../server/config';
import type { Actor } from '../../server/types';

const nullableUnitSchema = z.object({
  unitCode: z
  .string()
  .trim()
  .regex(/^[A-Z0-9_]+$/, 'Mã đơn vị không đúng định dạng')
  .nullable(),
});

@Roles('admin', 'ban4')
@Controller('tasks')
export class TasksController {
  constructor(
    @Optional()
    @Inject(DATABASE_DB)
    private readonly db?: DbType
  ) {}

  @Put(':id/unit')
  async assignTaskUnit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(nullableUnitSchema))
    body: z.infer<typeof nullableUnitSchema>,
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await setTaskUnit(id, body.unitCode, { actor, ip }, this.db);
  }

  @Get(':id/updates')
  @Roles('admin', 'ban4', 'unit')
  async getTaskUpdates(
    @Param(new ZodValidationPipe(taskIdParamSchema))
    params: { id: string },
    @CurrentActor() actor: Actor | null
  ) {
    return await getTaskUpdates(params.id, actor, this.db);
  }

  @Post(':id/updates')
  @Roles('admin', 'ban4', 'unit')
  @HttpCode(HttpStatus.CREATED)
  async submitTaskUpdate(
    @Param(new ZodValidationPipe(taskIdParamSchema))
    params: { id: string },
    @Body(new ZodValidationPipe(submitTaskUpdateBodySchema))
    body: SubmitTaskUpdatePayload,
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    const ip = getClientIp(req);
    return await submitTaskUpdate(params.id, body, actor, { ip }, this.db);
  }

  @Put(':id')
  async updateTask(
    @Param(new ZodValidationPipe(taskIdParamSchema))
    params: { id: string },
    @Body(new ZodValidationPipe(taskInputSchema))
    body: z.infer<typeof taskInputSchema>,
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await updateTask(params.id, body, actor, { ip }, this.db);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(
    @Param(new ZodValidationPipe(taskIdParamSchema))
    params: { id: string },
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    await deleteTask(params.id, actor, { ip }, this.db);
  }

  @Post(':id/split')
  @HttpCode(HttpStatus.CREATED)
  async splitTask(
    @Param(new ZodValidationPipe(taskIdParamSchema))
    params: { id: string },
    @Body(new ZodValidationPipe(splitTaskRequestSchema))
    body: z.infer<typeof splitTaskRequestSchema>,
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await splitTask(params.id, body, actor, { ip }, this.db);
  }
}
