import { SystemMode } from '../enums/system-mode.enum';
import { TenantType } from '../enums/tenant-type.enum';

export interface SystemContext {
  systemMode: SystemMode;
  tenantType: TenantType;
  isSuperAdmin?: boolean;
  isDevSuperAdmin?: boolean;
  allowedSystemTypes?: string[];
  role?: string;
}

export interface TenantSystemSettings {
  tenantId?: string;
  systemMode?: SystemMode;
  tenantType?: TenantType;
  enabledModules?: string[];
  featureFlags?: Record<string, boolean>;
}
