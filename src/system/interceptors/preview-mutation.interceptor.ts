import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from '../../common/http-types';
import { Observable } from 'rxjs';
import { PreviewModePolicyService } from '../preview-mode-policy.service';

@Injectable()
export class PreviewMutationInterceptor implements NestInterceptor {
  constructor(private readonly policy: PreviewModePolicyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    await this.policy.assertMutationAllowed(request);
    return next.handle();
  }
}
