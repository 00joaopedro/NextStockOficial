import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { canAccessDev } from './super-admin.util';

@Injectable()
export class DevSuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request?.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new UnauthorizedException('Sessao invalida ou ausente.');
    }

    if (!canAccessDev(user)) {
      throw new ForbiddenException('Acesso restrito ao Dev SuperAdmin.');
    }

    return true;
  }
}
