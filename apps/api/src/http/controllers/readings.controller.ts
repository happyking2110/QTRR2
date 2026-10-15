import {
  Controller,
  Post,
  Param,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DATABASE_DB } from '../../server/db/client';
import type { DbType } from '../../server/services/approvals';
import {
  withdrawReading,
  approveReading,
  rejectReading,
} from '../../server/services/approvals';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  submissionIdParamSchema,
  rejectBodySchema,
} from '../pipes/query-schemas';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import type { Actor } from '../../server/types';

@Controller('readings')
export class ReadingsController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Post(':id/withdraw')
  @Roles('admin', 'ban4', 'unit')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @Param(new ZodValidationPipe(submissionIdParamSchema))
    params: { id: string },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await withdrawReading(params.id, actor, { ip: req.ip }, this.db);
  }

  @Post(':id/approve')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param(new ZodValidationPipe(submissionIdParamSchema))
    params: { id: string },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await approveReading(params.id, actor, { ip: req.ip }, this.db);
  }

  @Post(':id/reject')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param(new ZodValidationPipe(submissionIdParamSchema))
    params: { id: string },
    @Body(new ZodValidationPipe(rejectBodySchema))
    body: { reason: string },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await rejectReading(params.id, body.reason, actor, { ip: req.ip }, this.db);
  }
}
