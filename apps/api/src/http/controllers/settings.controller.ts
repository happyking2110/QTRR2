import {
  Controller,
  Get,
  Put,
  Body,
  Inject,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DATABASE_DB } from '../../server/db/client';
import type { DbType } from '../../server/services/settings';
import {
  getSettings,
  updateSettings,
  type SettingsDto,
} from '../../server/services/settings';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { settingsBodySchema } from '../pipes/query-schemas';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import type { Actor } from '../../server/types';

@Roles('admin')
@Controller('settings')
export class SettingsController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Get()
  async getSettings() {
    return await getSettings(this.db);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @Body(new ZodValidationPipe(settingsBodySchema)) body: SettingsDto,
    @CurrentActor() actor: Actor | null,
    @Req() req: Request
  ) {
    return await updateSettings(body, actor, { ip: req.ip }, this.db);
  }
}
