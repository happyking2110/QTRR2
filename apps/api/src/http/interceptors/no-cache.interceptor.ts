import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class NoCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const res = context.switchToHttp().getResponse<ResponseLike>();
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Cache-Control', 'no-store');
    }
    return next.handle();
  }
}
