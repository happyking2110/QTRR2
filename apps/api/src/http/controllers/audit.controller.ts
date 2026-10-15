import {
  Controller,
  Get,
  Query,
  Inject,
} from '@nestjs/common';
import { DATABASE_DB } from '../../server/db/client';
import type { DbType } from '../../server/services/audit';
import {
  listAuditLogs,
  type ListAuditOptions,
} from '../../server/services/audit';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { auditQuerySchema } from '../pipes/query-schemas';
import { Roles } from '../decorators/roles.decorator';

@Roles('admin', 'ban4')
@Controller('audit')
export class AuditController {
  constructor(@Inject(DATABASE_DB) private readonly db: DbType) {}

  @Get()
  async listAudit(
    @Query(new ZodValidationPipe(auditQuerySchema))
    query: ListAuditOptions
  ) {
    return await listAuditLogs(query, this.db);
  }
}
