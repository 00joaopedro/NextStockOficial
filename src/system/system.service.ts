import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { SystemContextResponseDto } from './dto/system-context-response.dto';
import {
  canAccessDev,
  isSuperAdmin,
  SUPER_ADMIN_SYSTEM_TYPES,
} from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
import { SystemMode } from './enums/system-mode.enum';
import { TenantType } from './enums/tenant-type.enum';
import { SystemContext, TenantSystemSettings } from './interfaces/system-context.interface';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  listPublicHtmlPages() {
    const publicPath = this.resolvePublicPath();
    const pages = readdirSync(publicPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
      .map((entry) => ({
        file: entry.name,
        href: entry.name,
        label: this.formatPageLabel(entry.name),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));

    return {
      ok: true,
      pages,
    };
  }

  async getContext(
    currentUser?: Express.AuthenticatedUser,
    selectedBranchId?: string,
  ): Promise<SystemContextResponseDto> {
    if (!currentUser) {
      return {
        systemMode: SystemMode.Preview,
        tenantType: TenantType.Standard,
      };
    }

    if (isSuperAdmin(currentUser)) {
      const selectedContext = selectedBranchId
        ? await this.resolveSelectedBranchContext(selectedBranchId)
        : null;

      if (selectedContext) {
        return {
          systemMode:
            selectedContext.tenant.mode === 'visualizacao'
              ? SystemMode.Preview
              : SystemMode.Production,
          tenantType: this.resolveTenantType(selectedContext.tenant.systemType),
          isSuperAdmin: true,
          isDevSuperAdmin: canAccessDev(currentUser),
          allowedSystemTypes: SUPER_ADMIN_SYSTEM_TYPES,
          selectedBranch: selectedContext.selectedBranch,
        };
      }

      return {
        systemMode: SystemMode.Production,
        tenantType: this.resolveTenantType(currentUser?.systemType),
        isSuperAdmin: true,
        isDevSuperAdmin: canAccessDev(currentUser),
        allowedSystemTypes: SUPER_ADMIN_SYSTEM_TYPES,
      };
    }

    const tenantSettings = this.resolveTenantSettings(currentUser);

    return {
      systemMode: tenantSettings.systemMode ?? this.readSystemModeFromEnv(),
      tenantType: tenantSettings.tenantType ?? this.readTenantTypeFromEnv(),
    };
  }

  private async resolveSelectedBranchContext(selectedBranchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: selectedBranchId, isActive: true },
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

    if (!branch) {
      return null;
    }

    return {
      tenant: branch.tenant,
      selectedBranch: {
        id: branch.id,
        name: branch.name,
        tenantId: branch.tenantId,
        systemType: branch.tenant.systemType,
      },
    };
  }

  isPreviewMode(context?: Pick<SystemContext, 'systemMode'>): boolean {
    return (context?.systemMode ?? this.readSystemModeFromEnv()) === SystemMode.Preview;
  }

  private resolveTenantSettings(
    currentUser?: Express.AuthenticatedUser,
  ): TenantSystemSettings {
    if (!currentUser?.tenantId) {
      return {};
    }

    return {
      tenantId: currentUser?.tenantId ?? undefined,
      systemMode:
        currentUser.mode === 'visualizacao'
          ? SystemMode.Preview
          : SystemMode.Production,
      tenantType: this.resolveTenantType(currentUser.systemType),
    };
  }

  private resolveTenantType(systemType?: string | null): TenantType {
    return systemType === 'petshop' ? TenantType.Petshop : TenantType.Standard;
  }

  private readSystemModeFromEnv(): SystemMode {
    const rawMode = process.env.NEXTSTOCK_SYSTEM_MODE ?? process.env.SYSTEM_MODE;
    const normalizedMode = rawMode?.trim().toUpperCase();

    if (normalizedMode === SystemMode.Preview) {
      return SystemMode.Preview;
    }

    return SystemMode.Production;
  }

  private readTenantTypeFromEnv(): TenantType {
    const rawTenantType =
      process.env.NEXTSTOCK_TENANT_TYPE ?? process.env.TENANT_TYPE;
    const normalizedTenantType = rawTenantType?.trim().toUpperCase();

    if (normalizedTenantType === TenantType.Petshop) {
      return TenantType.Petshop;
    }

    return TenantType.Standard;
  }

  private resolvePublicPath() {
    const candidates = [
      join(__dirname, '..', 'public'),
      join(__dirname, '..', '..', 'public'),
      join(process.cwd(), 'public'),
    ];

    const publicPath = candidates.find((candidate) => existsSync(candidate));

    if (!publicPath) {
      return candidates[candidates.length - 1];
    }

    return publicPath;
  }

  private formatPageLabel(fileName: string) {
    return fileName
      .replace(/\.html$/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
