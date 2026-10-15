import {
  Controller,
  Get,
  Post,
  Query,
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
  getApprovals,
  bulkApprove,
  type BulkApproveItem,
} from '../../server/services/approvals';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  approvalsQuerySchema,
  bulkApproveBodySchema,
} from '../pipes/query-schemas';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import type { Actor } from '../../server/types';

@Controller('approvals')
export class ApprovalsController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Get()
  @Roles('admin', 'ban4', 'unit')
  async listApprovals(
    @Query(new ZodValidationPipe(approvalsQuerySchema))
    query: {
      cycle?: number;
      kind?: 'reading' | 'task_update';
      period?: string;
      riskCode?: string;
    },
    @CurrentActor() actor: Actor | null
  ) {
    return await getApprovals(query, actor, this.db);
  }

  @Post('bulk-approve')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async bulkApprove(
    @Body(new ZodValidationPipe(bulkApproveBodySchema))
    body: { items: BulkApproveItem[] },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await bulkApprove(body.items, actor, { ip: req.ip }, this.db);
  }
}
