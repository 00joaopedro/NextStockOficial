import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AuditWorkerModule } from './audit/audit-worker.module';
import { processRole } from './config/process-role';

async function bootstrap() {
  if (processRole() !== 'audit-worker') throw new Error('Audit worker requires NEXTSTOCK_PROCESS_ROLE=audit-worker');
  const app = await NestFactory.createApplicationContext(AuditWorkerModule);
  app.enableShutdownHooks();
  console.log('Audit worker started');
}
void bootstrap().catch((error: unknown) => {
  console.error(`Audit worker failed: ${error instanceof Error ? error.message.slice(0, 500) : 'startup failure'}`);
  process.exitCode = 1;
});
