import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, SystemMode, SystemType } from '@prisma/client';
import { canAccessDev } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';

export type TenantContext = {
  userId: string;
  tenantId: string;
  branchId: string | null;
  role: Role;
  systemType: SystemType;
  mode: SystemMode;
  isDevSuperAdmin: boolean;
};

export type ResolveTenantContextOptions = {
  selectedBranchId?: string | null;
  requireBranch?: boolean;
  writable?: boolean;
  expectedSystemType?: SystemType;
  allowedRoles?: Role[];
};

@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    user?: Express.AuthenticatedUser,
    options: ResolveTenantContextOptions = {},
  ): Promise<TenantContext> {
    if (!user) {
      throw new UnauthorizedException('Sessao expirada ou invalida.');
    }

    const devAccess = canAccessDev(user);
    const requestedBranchId = options.selectedBranchId?.trim() || null;
    const branchId = requestedBranchId ?? user.branchId ?? null;

    if (devAccess && !branchId) {
      throw new BadRequestException(
        'Dev SuperAdmin deve selecionar uma filial real para operar.',
      );
    }

    if (!devAccess && requestedBranchId && !this.userCanSelectBranch(user, requestedBranchId)) {
      throw new ForbiddenException('Filial nao permitida para este usuario.');
    }

    const branch = branchId
      ? await this.prisma.branch.findFirst({
          where: { id: branchId, isActive: true },
          select: {
            id: true,
            tenantId: true,
            tenant: {
              select: {
                id: true,
                systemType: true,
                mode: true,
              },
            },
          },
        })
      : null;

    if (branchId && !branch) {
      throw new ForbiddenException('Filial selecionada nao existe ou esta inativa.');
    }

    const authenticatedTenantId = user.tenantId ?? user.primaryTenantId ?? null;
    const tenantId = devAccess ? branch?.tenantId ?? null : authenticatedTenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Usuario sem tenant/empresa vinculado.');
    }

    if (!devAccess && branch && branch.tenantId !== tenantId) {
      throw new ForbiddenException('Filial nao pertence ao tenant autenticado.');
    }

    if (options.requireBranch && !branch) {
      throw new BadRequestException('Selecione uma filial valida para continuar.');
    }

    const tenant =
      branch?.tenant ??
      (await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, systemType: true, mode: true },
      }));

    if (!tenant) {
      throw new UnauthorizedException('Tenant/empresa nao encontrado.');
    }

    if (options.expectedSystemType && tenant.systemType !== options.expectedSystemType) {
      throw new ForbiddenException(
        options.expectedSystemType === SystemType.petshop
          ? 'Pagina exclusiva do modo Pet Shop.'
          : 'Recurso exclusivo do sistema padrao.',
      );
    }

    if (options.writable && tenant.mode === SystemMode.visualizacao) {
      throw new ForbiddenException('Modo visualizacao: alteracao bloqueada.');
    }

    if (
      options.allowedRoles?.length &&
      !devAccess &&
      !options.allowedRoles.includes(user.role)
    ) {
      throw new ForbiddenException('Usuario sem permissao para esta operacao.');
    }

    return {
      userId: user.id,
      tenantId,
      branchId: branch?.id ?? null,
      role: user.role,
      systemType: tenant.systemType,
      mode: tenant.mode,
      isDevSuperAdmin: devAccess,
    };
  }

  private userCanSelectBranch(user: Express.AuthenticatedUser, branchId: string) {
    if (user.branchId === branchId) {
      return true;
    }

    return user.branches?.some(
      (branch) => branch.id === branchId && branch.tenantId === user.tenantId,
    ) === true;
  }
}
