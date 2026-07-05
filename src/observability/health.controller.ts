import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { BillingExempt } from '../billing/billing-exempt.decorator';
import { PrismaService } from '../prisma/prisma.service';

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
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'available' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'unavailable',
      });
    }
  }
}
