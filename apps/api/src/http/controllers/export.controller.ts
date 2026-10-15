import {
  Controller,
  Get,
  Param,
  Query,
  Inject,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { exportProfileBM06, exportSummary } from '../../server/services/export-bm06';
import { DATABASE_DB, type DbType } from '../../server/db/client';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { cycleQuerySchema, riskCodeParamSchema } from '../pipes/query-schemas';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import type { Actor } from '../../server/types';

@Controller('export')
export class ExportController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Roles('admin', 'ban4', 'unit')
  @Get('profile/:riskCode')
  async exportProfile(
    @Param(new ZodValidationPipe(riskCodeParamSchema))
    params: { riskCode: string },
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number; period?: string },
    @CurrentActor() actor: Actor,
    @Res() res: Response
  ) {
    const { buffer, filename } = await exportProfileBM06(
      {
        riskCode: params.riskCode,
        cycle: query.cycle,
        period: query.period,
      },
      actor,
      this.db
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Roles('admin', 'ban4', 'unit', 'viewer')
  @Get('summary')
  async exportSummary(
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number; period?: string },
    @CurrentActor() actor: Actor,
    @Res() res: Response
  ) {
    const { buffer, filename } = await exportSummary(
      {
        cycle: query.cycle,
        period: query.period,
      },
      actor,
      this.db
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
