import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class DeterministicTestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('DeterministicTestAuthGuard is test-only.');
    }
    const request = context.switchToHttp().getRequest();
    const testUserId = request.header?.('x-test-user-id');
    const users = request.app?.locals?.securityTestUsers as
      | Map<string, AuthenticatedUser>
      | undefined;
    const user = request.testUser || users?.get(testUserId);
    if (!user) return false;
    request.user = user;
    return true;
  }
}
