import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { ReconciliationService } from '../../src/billing/reconciliation.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const limit = Number(process.env.BILLING_RECONCILIATION_BATCH_SIZE || 100);
    const result = await app
      .get(ReconciliationService)
      .reconcilePendingBatch(limit);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const name =
    error instanceof Error ? error.name : 'BillingReconciliationError';
  process.stderr.write(`${name}\n`);
  process.exitCode = 1;
});
