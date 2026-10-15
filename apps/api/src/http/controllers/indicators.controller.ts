import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  getIndicators,
  getIndicatorHistory,
  IndicatorFilterOptions,
  DbType,
} from '../../server/services/queries';
import {
  getZonePreview,
  submitReading,
  getIndicatorReadings,
  type SubmitReadingPayload,
} from '../../server/services/readings';
import { DATABASE_DB } from '../../server/db/client';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  indicatorsQuerySchema,
  indicatorIdParamSchema,
  zonePreviewQuerySchema,
  indicatorReadingsQuerySchema,
  submitReadingBodySchema,
} from '../pipes/query-schemas';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import type { Actor } from '../../server/types';

@Roles('admin', 'ban4', 'unit', 'viewer')
@Controller('indicators')
export class IndicatorsController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Get()
  async listIndicators(
    @Query(new ZodValidationPipe(indicatorsQuerySchema))
    query: IndicatorFilterOptions,
    @CurrentActor() actor: Actor | null
  ) {
    return await getIndicators(query, this.db, actor);
  }

  @Get(':id/history')
  async getHistory(
    @Param(new ZodValidationPipe(indicatorIdParamSchema))
    params: { id: string }
  ) {
    return await getIndicatorHistory(params.id, this.db);
  }

  @Get(':id/zone-preview')
  @Roles('admin', 'ban4', 'unit')
  async getZonePreview(
    @Param(new ZodValidationPipe(indicatorIdParamSchema))
    params: { id: string },
    @Query(new ZodValidationPipe(zonePreviewQuerySchema))
    query: { value: number }
  ) {
    return await getZonePreview(params.id, query.value, this.db);
  }

  @Get(':id/readings')
  @Roles('admin', 'ban4', 'unit')
  async getReadings(
    @Param(new ZodValidationPipe(indicatorIdParamSchema))
    params: { id: string },
    @Query(new ZodValidationPipe(indicatorReadingsQuerySchema))
    query: { period?: string },
    @CurrentActor() actor: Actor | null
  ) {
    return await getIndicatorReadings(params.id, query, actor, this.db);
  }

  @Post(':id/readings')
  @Roles('admin', 'ban4', 'unit')
  @HttpCode(HttpStatus.CREATED)
  async submitReading(
    @Param(new ZodValidationPipe(indicatorIdParamSchema))
    params: { id: string },
    @Body(new ZodValidationPipe(submitReadingBodySchema))
    body: SubmitReadingPayload,
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await submitReading(
      params.id,
      body,
      actor,
      { ip: req.ip },
      this.db
    );
  }
}

