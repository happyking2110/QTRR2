import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  Res,
  HttpCode,
  Inject,
  Optional,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Roles } from '../decorators/roles.decorator';
import { CurrentActor } from '../decorators/current-actor.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { DATABASE_DB, type DbType } from '../../server/db/client';
import { getClientIp } from '../../server/config';
import { AppError } from '../../server/errors';
import type { Actor } from '../../server/types';
import {
  listUsers,
  createUser,
  resetPassword,
  updateUser,
  importUsers,
  type UserListItem,
  type CreatedUser,
  type ResetPasswordResult,
  type ImportUsersResult,
} from '../../server/services/users';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const userRoleSchema = z.enum(['admin', 'ban4', 'unit', 'viewer']);

const createUserSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(255),
  fullName: z.string().trim().min(1, 'Họ tên không được để trống').max(255),
  role: userRoleSchema,
  unitCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]+$/, 'Mã đơn vị không đúng định dạng')
    .nullable()
    .optional(),
});

const updateUserSchema = z
  .object({
    role: userRoleSchema.optional(),
    unitCode: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]+$/, 'Mã đơn vị không đúng định dạng')
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.role !== undefined ||
      data.unitCode !== undefined ||
      data.isActive !== undefined,
    { message: 'Phải cung cấp ít nhất một trường cần cập nhật' }
  );

@Controller('users')
export class UsersController {
  constructor(
    @Optional()
    @Inject(DATABASE_DB)
    private readonly db?: DbType
  ) {}

  @Roles('admin')
  @Get()
  async list(
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('unitCode') unitCode?: string,
    @Query('isActive') isActiveStr?: string
  ): Promise<UserListItem[]> {
    let roleFilter: z.infer<typeof userRoleSchema> | undefined;
    if (role) {
      const parsedRole = userRoleSchema.safeParse(role);
      if (!parsedRole.success) {
        throw new AppError('VALIDATION', `Vai trò không hợp lệ: ${role}`, {
          fieldErrors: { role: `Vai trò không hợp lệ: ${role}` },
        });
      }
      roleFilter = parsedRole.data;
    }

    let isActiveFilter: boolean | undefined;
    if (isActiveStr !== undefined) {
      if (isActiveStr === 'true') {
        isActiveFilter = true;
      } else if (isActiveStr === 'false') {
        isActiveFilter = false;
      } else {
        throw new AppError('VALIDATION', 'Tham số isActive phải là true hoặc false', {
          fieldErrors: { isActive: 'Tham số isActive phải là true hoặc false' },
        });
      }
    }

    return listUsers(
      {
        q,
        role: roleFilter,
        unitCode,
        isActive: isActiveFilter,
      },
      this.db
    );
  }

  @Roles('admin')
  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(createUserSchema))
    body: z.infer<typeof createUserSchema>,
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ): Promise<CreatedUser> {
    const ip = getClientIp(req);
    return createUser(body, { actor, ip }, this.db);
  }

  @Roles('admin')
  @Get('import-template')
  getImportTemplate(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="mau-nguoi-dung.csv"'
    );
    res.send('email,full_name,role,unit_code\n');
  }

  @Roles('admin')
  @Post('import')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
    })
  )
  async importUsers(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ): Promise<ImportUsersResult> {
    if (!file) {
      throw new AppError(
        'VALIDATION',
        'Vui lòng chọn file CSV hoặc XLSX để tải lên'
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new AppError('VALIDATION', 'Tệp vượt quá 5 MB', {
        fieldErrors: { file: 'Tệp vượt quá 5 MB' },
      });
    }

    const ip = getClientIp(req);
    return importUsers(file.buffer, file.originalname, { actor, ip }, this.db);
  }

  @Roles('admin')
  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(
    @Param('id') id: string,
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ): Promise<ResetPasswordResult> {
    if (!UUID_REGEX.test(id)) {
      throw new AppError('VALIDATION', 'Mã người dùng không đúng định dạng UUID', {
        fieldErrors: { id: 'Mã người dùng không đúng định dạng UUID' },
      });
    }

    const ip = getClientIp(req);
    return resetPassword(id, { actor, ip }, this.db);
  }

  @Roles('admin')
  @Patch(':id')
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema))
    body: z.infer<typeof updateUserSchema>,
    @Req() req: Request,
    @CurrentActor() actor: Actor | null
  ): Promise<UserListItem> {
    if (!UUID_REGEX.test(id)) {
      throw new AppError('VALIDATION', 'Mã người dùng không đúng định dạng UUID', {
        fieldErrors: { id: 'Mã người dùng không đúng định dạng UUID' },
      });
    }

    const ip = getClientIp(req);
    return updateUser(id, body, { actor, ip }, this.db);
  }
}
