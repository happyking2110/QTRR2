import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Req,
  Inject,
  Optional,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { getUnits } from '../../server/services/queries';
import { upsertUnit } from '../../server/services/units';
import { DATABASE_DB, type DbType } from '../../server/db/client';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { getClientIp } from '../../server/config';
import type { Actor } from '../../server/types';

const upsertUnitSchema = z.object({
  name: z.string().trim().min(1, 'Tên đơn vị không được để trống').max(255),
  kind: z.enum(['department', 'center', 'group']),
});

@Roles('admin', 'ban4', 'unit', 'viewer')
@Controller('units')
export class UnitsController {
  constructor(
    @Optional()
    @Inject(DATABASE_DB)
    private readonly db?: DbType
  ) {}

  @Get()
  async listUnits() {
    return await getUnits(this.db);
  }

  @Roles('admin')
  @Put(':code')
  async upsertUnit(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(upsertUnitSchema))
    body: z.infer<typeof upsertUnitSchema>,
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ) {
    const ip = getClientIp(req);
    return await upsertUnit(code, body, { actor, ip }, this.db);
  }
}
