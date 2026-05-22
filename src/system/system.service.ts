import { Injectable } from '@nestjs/common';
import { SystemContextResponseDto } from './dto/system-context-response.dto';
import { SystemMode } from './enums/system-mode.enum';
import { TenantType } from './enums/tenant-type.enum';
import { SystemContext, TenantSystemSettings } from './interfaces/system-context.interface';

@Injectable()
export class SystemService {
  getContext(currentUser?: Express.AuthenticatedUser): SystemContextResponseDto {
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
}
