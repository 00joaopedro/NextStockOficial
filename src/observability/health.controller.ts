import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { BillingExempt } from '../billing/billing-exempt.decorator';
import { PrismaService } from '../prisma/prisma.service';

const REQUIRED_TABLES = [
  'tenants',
  'branches',
  'profiles',
  'tenant_members',
  'security_audit_events',
] as const;

@Controller('health')
@BillingExempt()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness() {
    try {
      const tables = await this.prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('tenants', 'branches', 'profiles', 'tenant_members', 'security_audit_events')
      `;
      const existing = new Set(tables.map((table) => table.table_name));
      const missing = REQUIRED_TABLES.filter((table) => !existing.has(table));
      if (missing.length) {
        throw new Error('required_schema_missing');
      }

      return { status: 'ready', database: 'available', schema: 'compatible' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'unavailable',
        schema: 'unavailable_or_incompatible',
      });
    }
  }
}
