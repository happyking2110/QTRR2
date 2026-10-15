import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { ZodSchema, ZodError, ZodIssue, ZodIssueCode } from 'zod';
import { AppError } from '../../server/errors';

export function formatZodIssueVietnamese(issue: ZodIssue): string {
  // Nếu schema đã chủ động truyền thông báo tiếng Việt tùy biến (không phải tiếng Anh mặc định của zod)
  if (
    issue.message &&
    !issue.message.startsWith('Invalid') &&
    !issue.message.startsWith('Expected') &&
    !issue.message.startsWith('Too small') &&
    !issue.message.startsWith('Too big') &&
    !issue.message.startsWith('Required') &&
    !issue.message.includes('pattern')
  ) {
    return issue.message;
  }

  const code = issue.code as string;
  const anyIssue = issue as unknown as Record<string, unknown>;

  if (code === 'invalid_format' || code === 'invalid_string') {
    if (anyIssue.format === 'uuid' || anyIssue.validation === 'uuid') {
      return 'Mã định danh không đúng chuẩn UUID';
    }
    if (anyIssue.format === 'regex' || anyIssue.validation === 'regex') {
      return 'Định dạng dữ liệu không hợp lệ';
    }
    if (anyIssue.format === 'email' || anyIssue.validation === 'email') {
      return 'Địa chỉ email không đúng định dạng';
    }
    if (anyIssue.format === 'url' || anyIssue.validation === 'url') {
      return 'Địa chỉ URL không đúng định dạng';
    }
    return 'Định dạng chuỗi không hợp lệ';
  }

  if (code === 'invalid_value' || code === 'invalid_enum_value') {
    return 'Giá trị không nằm trong danh sách cho phép';
  }

  if (code === 'too_small') {
    const origin = anyIssue.origin || anyIssue.type;
    if (origin === 'number') {
      return 'Giá trị nhỏ hơn mức tối thiểu cho phép';
    }
    if (origin === 'string') {
      return 'Độ dài chuỗi quá ngắn';
    }
    if (origin === 'array') {
      return 'Số lượng phần tử quá ít';
    }
    return 'Giá trị quá nhỏ so với mức cho phép';
  }

  if (code === 'too_big') {
    const origin = anyIssue.origin || anyIssue.type;
    if (origin === 'number') {
      return 'Giá trị vượt quá mức tối đa cho phép';
    }
    if (origin === 'string') {
      return 'Độ dài chuỗi vượt quá mức cho phép';
    }
    if (origin === 'array') {
      return 'Số lượng phần tử vượt quá mức cho phép';
    }
    return 'Giá trị vượt quá mức cho phép';
  }

  if (code === 'invalid_type') {
    const msg = issue.message || '';
    if (anyIssue.received === 'undefined' || msg.includes('received undefined')) {
      return 'Trường dữ liệu này là bắt buộc';
    }
    return 'Kiểu dữ liệu không đúng';
  }

  if (code === 'custom') {
    return issue.message || 'Dữ liệu không hợp lệ';
  }

  return 'Dữ liệu không hợp lệ';
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata?: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of (result.error as ZodError).issues) {
        if (issue.code === 'unrecognized_keys') {
          for (const k of (issue as any).keys) {
            const keyPath = issue.path && issue.path.length > 0 ? `${issue.path.join('.')}.${k}` : k;
            if (!fieldErrors[keyPath]) {
              fieldErrors[keyPath] = `Trường không được phép: ${k}`;
            }
          }
          continue;
        }
        const path = issue.path.join('.') || 'root';
        if (!fieldErrors[path]) {
          fieldErrors[path] = formatZodIssueVietnamese(issue);
        }
      }
      throw new AppError('VALIDATION', 'Dữ liệu không hợp lệ', { fieldErrors });
    }
    return result.data;
  }
}

