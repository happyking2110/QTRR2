import { Controller, Get, Query, Inject } from '@nestjs/common';
import { getOverview, DbType } from '../../server/services/queries';
import { DATABASE_DB } from '../../server/db/client';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { cycleQuerySchema } from '../pipes/query-schemas';
import { Roles } from '../decorators/roles.decorator';

@Roles('admin', 'ban4', 'unit', 'viewer')
@Controller('overview')
export class OverviewController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Get()
  async getOverview(
    @Query(new ZodValidationPipe(cycleQuerySchema))
    query: { cycle?: number; period?: string }
  ) {
    return await getOverview(query, this.db);
  }
}
