import { Controller, Get, Inject, Res } from '@nestjs/common';
import type postgres from 'postgres';
import { Public } from '../decorators/public.decorator';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

interface HttpResponse {
  status(code: number): this;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly sql: postgres.Sql,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: HttpResponse) {
    try {
      await this.sql`select 1`;
      return { status: 'ok' };
    } catch {
      res.status(503);
      return {
        code: 'INTERNAL',
        message: 'Dịch vụ chưa sẵn sàng',
      };
    }
  }
}
