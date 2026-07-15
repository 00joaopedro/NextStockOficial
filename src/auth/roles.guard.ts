import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditOutcome, AuditSeverity, Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { canAccessDev } from './super-admin.util';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Optional() private readonly audit?: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (canAccessDev(user)) {
      return true;
    }

    const roles = user?.roles ?? (user?.role ? [user.role] : []);
    const allowed = requiredRoles.some((role) => roles.includes(role));
    if (!allowed) {
      void this.audit?.record({
        ...this.audit.fromRequest(request),
        eventType: 'authorization.role_denied',
        action: `${request.method} ${request.path}`,
        outcome: AuditOutcome.DENIED,
        severity: AuditSeverity.MEDIUM,
        reasonCode: 'ROLE_NOT_ALLOWED',
        metadata: { requiredRoles },
      });
    }
    return allowed;
  }
}
