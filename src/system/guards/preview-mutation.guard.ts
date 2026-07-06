import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PreviewModePolicyService } from '../preview-mode-policy.service';

@Injectable()
export class PreviewMutationGuard implements CanActivate {
  constructor(private readonly policy: PreviewModePolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    await this.policy.assertMutationAllowed(request);
    return true;
  }
}
