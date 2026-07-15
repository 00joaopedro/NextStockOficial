import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Role, SystemMode, SystemType } from '@prisma/client';
import { canAccessDev } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { toTenantSummary } from './tenant.utils';

const DEV_WORKSPACE_CONFIG: Record<
  SystemType,
  {
    tenantName: string;
    tenantSlug: string;
    branchName: string;
    branchSlug: string;
    mode: SystemMode;
  }
> = {
  [SystemType.padrao]: {
    tenantName: 'NextStock Dev Padrao',
    tenantSlug: 'nextstock-dev-padrao',
    branchName: 'Matriz Dev Padrao',
    branchSlug: 'matriz-dev-padrao',
    mode: SystemMode.padrao,
  },
  [SystemType.petshop]: {
    tenantName: 'NextStock Dev Pet Shop',
    tenantSlug: 'nextstock-dev-petshop',
    branchName: 'Matriz Dev Pet Shop',
    branchSlug: 'matriz-dev-petshop',
    mode: SystemMode.petshop,
  },
};

type WorkspaceBranch = {
  id: string;
  name: string;
  slug: string;
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    systemType: SystemType;
    mode: SystemMode;
  };
};

@Injectable()
export class DevWorkspaceService {
  private readonly logger = new Logger(DevWorkspaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  getSupportedSystemTypes() {
    return [SystemType.padrao, SystemType.petshop];
  }

  normalizeSystemType(value?: string | null): SystemType {
    return value === SystemType.petshop ? SystemType.petshop : SystemType.padrao;
  }

  async ensureDefaultWorkspaces(devUserId: string) {
    try {
      const workspaces: unknown[] = [];

      for (const systemType of this.getSupportedSystemTypes()) {
        workspaces.push(await this.ensureDefaultWorkspace(devUserId, systemType));
      }

      return workspaces;
    } catch (error) {
      if (this.isMissingDevWorkspaceTableError(error)) {
        this.logger.error(
          'DEV_WORKSPACES_NOT_MIGRATED table=dev_workspaces action=ensureDefaultWorkspaces',
        );
        throw new ServiceUnavailableException(
          'Estrutura DevWorkspace nao esta migrada. Rode npm run db:migrate como etapa controlada antes do deploy.',
        );
      }

      throw error;
    }
  }

  async ensureDefaultWorkspace(devUserId: string, systemType: SystemType) {
    const config = DEV_WORKSPACE_CONFIG[systemType];

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: config.tenantSlug },
        update: {
          name: config.tenantName,
          systemType,
          mode: config.mode,
        },
        create: {
          name: config.tenantName,
          slug: config.tenantSlug,
          systemType,
          mode: config.mode,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          systemType: true,
          mode: true,
        },
      });

      const existingBranch = await tx.branch.findFirst({
        where: { tenantId: tenant.id, slug: config.branchSlug },
        select: {
          id: true,
          name: true,
          slug: true,
          tenantId: true,
          isActive: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              systemType: true,
              mode: true,
            },
          },
        },
      });
      const branch =
        existingBranch && existingBranch.isActive
          ? existingBranch
          : existingBranch
            ? await tx.branch.update({
                where: { id: existingBranch.id },
                data: {
                  name: config.branchName,
                  isDefault: true,
                  isActive: true,
                },
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  tenantId: true,
                  isActive: true,
                  tenant: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      systemType: true,
                      mode: true,
                    },
                  },
                },
              })
            : await tx.branch.create({
                data: {
                  tenantId: tenant.id,
                  name: config.branchName,
                  slug: config.branchSlug,
                  isDefault: true,
                  isActive: true,
                },
              select: {
                id: true,
                name: true,
                slug: true,
                tenantId: true,
                isActive: true,
                tenant: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    systemType: true,
                    mode: true,
                  },
                },
              },
            });

      await tx.tenantMember.upsert({
        where: {
          tenantId_userProfileId: {
            tenantId: tenant.id,
            userProfileId: devUserId,
          },
        },
        update: {
          branchId: branch.id,
          role: Role.Admin,
        },
        create: {
          tenantId: tenant.id,
          userProfileId: devUserId,
          branchId: branch.id,
          role: Role.Admin,
        },
      });

      const workspace = await (tx as any).devWorkspace.upsert({
        where: {
          devUserId_systemType: {
            devUserId,
            systemType,
          },
        },
        update: {
          tenantId: tenant.id,
          branchId: branch.id,
          isDefaultWorkspace: true,
        },
        create: {
          devUserId,
          systemType,
          tenantId: tenant.id,
          branchId: branch.id,
          isDefaultWorkspace: true,
        },
        select: {
          id: true,
          systemType: true,
          tenantId: true,
          branchId: true,
          isDefaultWorkspace: true,
        },
      });

      return {
        ...workspace,
        tenant,
        branch,
        selectedBranch: this.toSelectedBranch(branch),
      };
    });
  }

  async listDefaultWorkspaces(devUserId: string) {
    try {
      const workspaces = await (this.prisma as any).devWorkspace.findMany({
        where: { devUserId },
        orderBy: { systemType: 'asc' },
        select: {
          id: true,
          systemType: true,
          tenantId: true,
          branchId: true,
          isDefaultWorkspace: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              systemType: true,
              mode: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              slug: true,
              tenantId: true,
              isActive: true,
            },
          },
        },
      });

      return workspaces.filter(
        (workspace: any) =>
          workspace.branch?.isActive === true &&
          workspace.tenant?.systemType === workspace.systemType,
      );
    } catch (error) {
      if (this.isMissingDevWorkspaceTableError(error)) {
        this.logger.error(
          'DEV_WORKSPACES_NOT_MIGRATED table=dev_workspaces action=listDefaultWorkspaces',
        );
        return [];
      }

      throw error;
    }
  }

  async getWorkspaceForBranch(devUserId: string, branchId: string) {
    try {
      return await (this.prisma as any).devWorkspace.findFirst({
        where: { devUserId, branchId },
        select: {
          id: true,
          systemType: true,
          tenantId: true,
          branchId: true,
          tenant: {
            select: { id: true, systemType: true, mode: true },
          },
          branch: {
            select: { id: true, tenantId: true, isActive: true },
          },
        },
      });
    } catch (error) {
      if (this.isMissingDevWorkspaceTableError(error)) {
        this.logger.error(
          'DEV_WORKSPACES_NOT_MIGRATED table=dev_workspaces action=getWorkspaceForBranch',
        );
        return null;
      }

      throw error;
    }
  }

  async assertBranchIsWorkspace(devUserId: string, branchId: string) {
    const workspace = await this.getWorkspaceForBranch(devUserId, branchId);

    if (!workspace?.branch?.isActive) {
      throw new BadRequestException(
        'Contexto Dev invalido. Selecione um workspace Dev valido.',
      );
    }

    if (
      workspace.branch.tenantId !== workspace.tenantId ||
      workspace.tenant.systemType !== workspace.systemType
    ) {
      this.logger.error(
        `DEV_WORKSPACE_INCONSISTENT user=${devUserId.slice(0, 8)} branch=${branchId.slice(0, 8)}`,
      );
      throw new BadRequestException('Workspace Dev inconsistente.');
    }

    return workspace;
  }

  async listSupportBranches(user: AuthenticatedUser, systemType?: string) {
    if (!canAccessDev(user)) {
      return [];
    }

    const normalizedSystemType = systemType
      ? this.normalizeSystemType(systemType)
      : undefined;
    const workspaces = await this.listDefaultWorkspaces(user.id);
    const workspaceBranchIds = new Set(
      workspaces.map((workspace: any) => workspace.branchId),
    );

    const branches = await this.prisma.branch.findMany({
      where: {
        isActive: true,
        ...(normalizedSystemType
          ? { tenant: { systemType: normalizedSystemType } }
          : {}),
      },
      orderBy: [
        { tenant: { systemType: 'asc' } },
        { tenant: { name: 'asc' } },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        slug: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            systemType: true,
            mode: true,
          },
        },
      },
    });

    return branches
      .filter((branch) => !workspaceBranchIds.has(branch.id))
      .map((branch) => ({
        id: branch.id,
        name: branch.name,
        slug: branch.slug,
        tenantId: branch.tenantId,
        tenant: toTenantSummary(branch.tenant),
        systemType: branch.tenant.systemType,
        mode: branch.tenant.mode,
      }));
  }

  toBranchSummary(workspace: {
    branch: WorkspaceBranch;
    tenant: WorkspaceBranch['tenant'];
    systemType: SystemType;
  }) {
    return {
      id: workspace.branch.id,
      name: workspace.branch.name,
      slug: workspace.branch.slug,
      tenantId: workspace.tenant.id,
      tenant: toTenantSummary(workspace.tenant),
      role: Role.superAdmin,
      systemType: workspace.systemType,
      mode: workspace.tenant.mode,
      isDevWorkspace: true,
    };
  }

  toSelectedBranch(branch: WorkspaceBranch) {
    return {
      id: branch.id,
      name: branch.name,
      tenantId: branch.tenantId,
      systemType: branch.tenant.systemType,
      isDevWorkspace: true,
    };
  }

  private isMissingDevWorkspaceTableError(error: unknown) {
    const prismaError = error as {
      code?: string;
      message?: string;
      meta?: Record<string, unknown>;
    };
    const details = JSON.stringify({
      message: prismaError?.message,
      meta: prismaError?.meta,
    });

    return (
      (prismaError?.code === 'P2021' || prismaError?.code === 'P2022') &&
      details.includes('dev_workspaces')
    );
  }
}
