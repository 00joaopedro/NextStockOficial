import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, SystemMode, SystemType } from '@prisma/client';
import { canAccessDev } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { DevWorkspaceService } from './dev-workspace.service';
import {
  PREVIEW_MODE_MUTATION_BLOCKED,
  PREVIEW_MODE_MUTATION_MESSAGE,
} from '../system/preview-mode.constants';

export type TenantContext = {
  userId: string;
  tenantId: string;
  branchId: string | null;
  role: Role;
  systemType: SystemType;
  mode: SystemMode;
  isDevSuperAdmin: boolean;
  contextKind: 'normal' | 'dev-workspace' | 'dev-support';
};

export type ResolveTenantContextOptions = {
  selectedBranchId?: string | null;
  requireBranch?: boolean;
  writable?: boolean;
  expectedSystemType?: SystemType;
  allowedRoles?: Role[];
  allowDevSupport?: boolean;
};

@Injectable()
export class TenantContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devWorkspaces: DevWorkspaceService,
  ) {}

  async resolve(
    user?: AuthenticatedUser,
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
      throw new ForbiddenException(
        'Filial selecionada nao existe ou esta inativa.',
      );
    }

    let contextKind: TenantContext['contextKind'] = 'normal';

    if (devAccess && branch) {
      const workspace = await this.devWorkspaces.getWorkspaceForBranch(
        user.id,
        branch.id,
      );

      if (workspace) {
        if (
          workspace.tenantId !== branch.tenantId ||
          workspace.tenant.systemType !== branch.tenant.systemType
        ) {
          throw new ForbiddenException('Workspace Dev inconsistente.');
        }

        contextKind = 'dev-workspace';
      } else if (options.allowDevSupport) {
        contextKind = 'dev-support';
      } else {
        throw new ForbiddenException(
          'Contexto Dev deve usar workspace isolado. Para tenant real, selecione modo suporte explicitamente.',
        );
      }
    }

    const authenticatedTenantId = user.tenantId ?? user.primaryTenantId ?? null;
    const tenantId = devAccess
      ? (branch?.tenantId ?? null)
      : (branch?.tenantId ?? authenticatedTenantId);

    if (!tenantId) {
      throw new UnauthorizedException('Usuario sem tenant/empresa vinculado.');
    }

    if (options.requireBranch && !branch) {
      throw new BadRequestException(
        'Selecione uma filial valida para continuar.',
      );
    }

    const liveMembership = devAccess
      ? null
      : await this.prisma.tenantMember.findFirst({
          where: {
            userProfileId: user.id,
            tenantId,
            ...(branch ? { branchId: branch.id } : {}),
          },
          select: {
            id: true,
            role: true,
            tenantId: true,
            branchId: true,
            branch: {
              select: {
                id: true,
                tenantId: true,
                isActive: true,
              },
            },
          },
        });

    if (!devAccess && !liveMembership) {
      throw new ForbiddenException(
        branch
          ? 'Usuario nao possui acesso atual a filial selecionada.'
          : 'Usuario nao possui acesso atual ao tenant selecionado.',
      );
    }

    if (
      !devAccess &&
      branch &&
      (!liveMembership?.branch ||
        !liveMembership.branch.isActive ||
        liveMembership.branch.tenantId !== tenantId)
    ) {
      throw new ForbiddenException('Membership ou filial nao esta mais ativa.');
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

    if (
      !devAccess &&
      Array.isArray(user.allowedSystemTypes) &&
      user.allowedSystemTypes.length > 0 &&
      !user.allowedSystemTypes.includes(tenant.systemType)
    ) {
      throw new ForbiddenException(
        'Tipo de sistema nao permitido para este usuario.',
      );
    }

    if (
      options.expectedSystemType &&
      tenant.systemType !== options.expectedSystemType
    ) {
      throw new ForbiddenException(
        options.expectedSystemType === SystemType.petshop
          ? 'Pagina exclusiva do modo Pet Shop.'
          : 'Recurso exclusivo do sistema padrao.',
      );
    }

    if (options.writable && tenant.mode === SystemMode.visualizacao) {
      throw new ForbiddenException({
        code: PREVIEW_MODE_MUTATION_BLOCKED,
        message: PREVIEW_MODE_MUTATION_MESSAGE,
      });
    }

    if (
      options.allowedRoles?.length &&
      !devAccess &&
      !options.allowedRoles.includes(liveMembership!.role)
    ) {
      throw new ForbiddenException('Usuario sem permissao para esta operacao.');
    }

    return {
      userId: user.id,
      tenantId,
      branchId: branch?.id ?? null,
      role: devAccess ? user.role : liveMembership!.role,
      systemType: tenant.systemType,
      mode: tenant.mode,
      isDevSuperAdmin: devAccess,
      contextKind,
    };
  }
}
