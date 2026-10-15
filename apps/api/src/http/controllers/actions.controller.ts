import { Controller, Get, Query, Inject } from '@nestjs/common';
import { getActions, ActionFilterOptions, DbType } from '../../server/services/queries';
import { DATABASE_DB } from '../../server/db/client';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { actionsQuerySchema } from '../pipes/query-schemas';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import type { Actor } from '../../server/types';

@Roles('admin', 'ban4', 'unit', 'viewer')
@Controller('actions')
export class ActionsController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Get()
  async listActions(
    @Query(new ZodValidationPipe(actionsQuerySchema))
    query: ActionFilterOptions,
    @CurrentActor() actor: Actor | null
  ) {
    return await getActions(query, this.db, actor);
  }
}
