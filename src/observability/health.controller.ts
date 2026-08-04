import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { BillingExempt } from '../billing/billing-exempt.decorator';
import { SchemaCompatibilityService } from './schema-compatibility.service';

@Controller('health')
@BillingExempt()
export class HealthController {
  constructor(
    private readonly schemaCompatibility: SchemaCompatibilityService,
  ) {}

  @Get()
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness() {
    const result = await this.schemaCompatibility.check();
    if (result.ready) {
      return { status: 'ready' };
    }

    throw new ServiceUnavailableException({
      status: 'not_ready',
      reason: result.reason,
    });
  }
}
