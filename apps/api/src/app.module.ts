import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD, Reflector } from '@nestjs/core';
import { HealthController, DATABASE_CONNECTION } from './http/controllers/health.controller';
import { CyclesController } from './http/controllers/cycles.controller';
import { UnitsController } from './http/controllers/units.controller';
import { ProfilesController } from './http/controllers/profiles.controller';
import { OverviewController } from './http/controllers/overview.controller';
import { HeatmapController } from './http/controllers/heatmap.controller';
import { ActionsController } from './http/controllers/actions.controller';
import { IndicatorsController } from './http/controllers/indicators.controller';
import { AuthController } from './http/controllers/auth.controller';
import { UsersController } from './http/controllers/users.controller';
import { TasksController } from './http/controllers/tasks.controller';
import { ReadingsController } from './http/controllers/readings.controller';
import { TaskUpdatesController } from './http/controllers/task-updates.controller';
import { ApprovalsController } from './http/controllers/approvals.controller';
import { SettingsController } from './http/controllers/settings.controller';
import { AuditController } from './http/controllers/audit.controller';
import { ExportController } from './http/controllers/export.controller';
import { NoCacheInterceptor } from './http/interceptors/no-cache.interceptor';
import { OriginGuard } from './http/guards/origin.guard';
import { SessionGuard } from './http/guards/session.guard';
import { PasswordChangeGuard } from './http/guards/password-change.guard';
import { RolesGuard } from './http/guards/roles.guard';
import { conn, db, DATABASE_DB } from './server/db/client';

@Module({
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    CyclesController,
    UnitsController,
    ProfilesController,
    OverviewController,
    HeatmapController,
    ActionsController,
    IndicatorsController,
    TasksController,
    ReadingsController,
    TaskUpdatesController,
    ApprovalsController,
    SettingsController,
    AuditController,
    ExportController,
  ],
  providers: [
    Reflector,
    {
      provide: DATABASE_CONNECTION,
      useValue: conn,
    },
    {
      provide: DATABASE_DB,
      useValue: db,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: NoCacheInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: OriginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SessionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PasswordChangeGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [DATABASE_CONNECTION, DATABASE_DB],
})
export class AppModule {}

