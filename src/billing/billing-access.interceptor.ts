import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { BILLING_EXEMPT_KEY } from './billing-exempt.decorator';
import { BillingEntitlementService } from './billing-entitlement.service';

@Injectable()
export class BillingAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlement: BillingEntitlementService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (process.env.BILLING_ENFORCEMENT_ENABLED?.toLowerCase() !== 'true') {
      return next.handle();
    }
    const exempt = this.reflector.getAllAndOverride<boolean>(BILLING_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (exempt) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user as Express.AuthenticatedUser | undefined;
    if (!user) return next.handle();

    const result = await this.entitlement.forUser(user);
    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: 'BILLING_ACCESS_REQUIRED',
          reason: result.reason,
          redirectTo: result.redirectTo,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return next.handle();
  }
}
