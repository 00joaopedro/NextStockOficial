import { SystemMode } from '../enums/system-mode.enum';
import { TenantType } from '../enums/tenant-type.enum';

export class SystemContextResponseDto {
  systemMode!: SystemMode;
  tenantType!: TenantType;
  isSuperAdmin?: boolean;
  isDevSuperAdmin?: boolean;
  allowedSystemTypes?: string[];
  role?: string;
  selectedBranch?: {
    id: string;
    name: string;
    tenantId: string;
    systemType: string;
  };
}
