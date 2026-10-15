import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { getCycles, getPeriodsByYear, DbType } from '../../server/services/queries';
import {
  ensurePeriods,
  createEventPeriod,
  closePeriod,
  reopenPeriod,
} from '../../server/services/periods';
import {
  importCycle,
  cloneCycle,
  archiveCycle,
} from '../../server/services/cycles';
import { DATABASE_DB } from '../../server/db/client';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  yearParamSchema,
  yearAndKeyParamSchema,
  createEventPeriodBodySchema,
  reopenPeriodBodySchema,
} from '../pipes/query-schemas';
import { cloneCycleRequestSchema } from '../pipes/plan-4a-schemas';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import { AppError } from '../../server/errors';
import type { Actor } from '../../server/types';

@Roles('admin', 'ban4', 'unit', 'viewer')
@Controller('cycles')
export class CyclesController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Get()
  async listCycles() {
    return await getCycles(this.db);
  }

  @Post('import')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
    })
  )
  async importCycle(
    @Body('year') yearInput: string | number | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentActor() actor: Actor | null
  ) {
    if (!file) {
      throw new AppError('VALIDATION', 'Thiếu tệp tải lên', {
        fieldErrors: { file: 'Vui lòng chọn tệp Excel (.xlsx)' },
      });
    }

    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new AppError('VALIDATION', 'Tệp tải lên phải có định dạng .xlsx', {
        fieldErrors: { file: 'Chỉ chấp nhận tệp định dạng .xlsx' },
      });
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new AppError('VALIDATION', 'Tệp vượt quá 5 MB', {
        fieldErrors: { file: 'Tệp vượt quá 5 MB' },
      });
    }

    const yearNum = typeof yearInput === 'number' ? yearInput : parseInt(String(yearInput || ''), 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new AppError('VALIDATION', 'Năm chu kỳ không hợp lệ', {
        fieldErrors: { year: 'Năm phải từ 2000 đến 2100' },
      });
    }

    const report = await importCycle({ year: yearNum, file: file.buffer, actor }, this.db);
    return {
      year: report.year,
      counts: report.counts,
      issues: report.issues,
    };
  }

  @Post(':year/clone')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async cloneCycle(
    @Param(new ZodValidationPipe(yearParamSchema)) params: { year: number },
    @Body(new ZodValidationPipe(cloneCycleRequestSchema)) body: { fromYear: number },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    const report = await cloneCycle(body.fromYear, params.year, actor, { ip: req.ip }, this.db);
    return {
      year: report.year,
      counts: report.counts,
      issues: report.issues,
    };
  }

  @Post(':year/archive')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async archiveCycle(
    @Param(new ZodValidationPipe(yearParamSchema)) params: { year: number },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await archiveCycle(params.year, actor, { ip: req.ip }, this.db);
  }

  @Get(':year/periods')
  async listPeriods(
    @Param(new ZodValidationPipe(yearParamSchema)) params: { year: number }
  ) {
    return await getPeriodsByYear(params.year, this.db);
  }

  @Post(':year/periods/ensure')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async ensurePeriods(
    @Param(new ZodValidationPipe(yearParamSchema)) params: { year: number },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await ensurePeriods(params.year, actor, { ip: req.ip }, this.db);
  }

  @Post(':year/periods/events')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async createEventPeriod(
    @Param(new ZodValidationPipe(yearParamSchema)) params: { year: number },
    @Body(new ZodValidationPipe(createEventPeriodBodySchema))
    body: { label: string; startsOn: string; endsOn: string },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await createEventPeriod(params.year, body, actor, { ip: req.ip }, this.db);
  }

  @Post(':year/periods/:key/close')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async closePeriod(
    @Param(new ZodValidationPipe(yearAndKeyParamSchema))
    params: { year: number; key: string },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await closePeriod(params.year, params.key, actor, { ip: req.ip }, this.db);
  }

  @Post(':year/periods/:key/reopen')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async reopenPeriod(
    @Param(new ZodValidationPipe(yearAndKeyParamSchema))
    params: { year: number; key: string },
    @Body(new ZodValidationPipe(reopenPeriodBodySchema))
    body: { reason: string },
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await reopenPeriod(
      params.year,
      params.key,
      body.reason,
      actor,
      { ip: req.ip },
      this.db
    );
  }
}
