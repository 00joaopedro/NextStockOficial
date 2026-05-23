import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { SystemContextResponseDto } from './dto/system-context-response.dto';
import { isSuperAdmin, SUPER_ADMIN_SYSTEM_TYPES } from '../auth/super-admin.util';
import { SystemMode } from './enums/system-mode.enum';
import { TenantType } from './enums/tenant-type.enum';
import { SystemContext, TenantSystemSettings } from './interfaces/system-context.interface';

@Injectable()
export class SystemService {
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

  getContext(currentUser?: Express.AuthenticatedUser): SystemContextResponseDto {
    if (isSuperAdmin(currentUser)) {
      return {
        systemMode: SystemMode.Production,
        tenantType: TenantType.Petshop,
        isSuperAdmin: true,
        allowedSystemTypes: SUPER_ADMIN_SYSTEM_TYPES,
      };
    }

    const tenantSettings = this.resolveTenantSettings(currentUser);

    return {
      systemMode: tenantSettings.systemMode ?? this.readSystemModeFromEnv(),
      tenantType: tenantSettings.tenantType ?? this.readTenantTypeFromEnv(),
    };
  }

  isPreviewMode(context?: Pick<SystemContext, 'systemMode'>): boolean {
    return (context?.systemMode ?? this.readSystemModeFromEnv()) === SystemMode.Preview;
  }

  private resolveTenantSettings(
    currentUser?: Express.AuthenticatedUser,
  ): TenantSystemSettings {
    // Future expansion point:
    // 1. Resolve tenant from currentUser.tenantId.
    // 2. Read tenant type, plan, modules and flags from Prisma/Supabase.
    // 3. Merge tenant settings with plan defaults and global flags.
    return {
      tenantId: currentUser?.tenantId ?? undefined,
    };
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
