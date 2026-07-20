import 'dotenv/config';
import { spawnSync } from 'child_process';
import { validateMigrationTarget } from './validate-target-lib';
import {
  administrativePrisma,
  inspectMigrationState,
  INTERNAL_RECEIPT_ENUM_MIGRATION,
  sanitizeCommandOutput,
} from './migration-inspection';
import { verifyEssentialSchema } from './essential-schema';

function runPrisma(args: string[], allowPendingStatus = false) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['prisma', ...args], {
    env: process.env,
    encoding: 'utf8',
  });
  const output = sanitizeCommandOutput(
    `${result.stdout || ''}${result.stderr || ''}`,
  );
  if (output) console.log(output);

  if (result.error) throw result.error;
  if (result.status !== 0 && !(allowPendingStatus && result.status === 1)) {
    throw new Error(
      `prisma ${args.join(' ')} failed with exit code ${result.status}.`,
    );
  }
}

async function main() {
  const target = validateMigrationTarget(process.env);
  console.log(
    `Pre-deploy migration target validated for APP_ENV=${target.appEnv} (${target.targetDescription}).`,
  );

  const prisma = administrativePrisma();
  try {
    const before = await inspectMigrationState(prisma);
    if (before.failed.length) {
      const names = before.failed.map((row) => row.migration_name).join(', ');
      const internalReceiptFailed = before.failed.some(
        (row) => row.migration_name === INTERNAL_RECEIPT_ENUM_MIGRATION,
      );
      const repairHint = internalReceiptFailed
        ? ` Inspect the enum state and run "npm run railway:migrate:repair-internal-receipt" only after approval; enum evidence=${before.internalReceiptEnumExists ? 'present' : 'absent'}.`
        : '';
      throw new Error(
        `Unresolved failed Prisma migrations detected: ${names}. migrate deploy was not attempted.${repairHint}`,
      );
    }

    console.log('Running read-only Prisma migration status before deploy.');
    runPrisma(['migrate', 'status'], true);

    console.log(
      'Applying pending Prisma migrations through the administrative connection.',
    );
    runPrisma(['migrate', 'deploy']);

    const after = await inspectMigrationState(prisma);
    if (after.failed.length) {
      throw new Error(
        `Migration deploy left unresolved migrations: ${after.failed.map((row) => row.migration_name).join(', ')}.`,
      );
    }
    await verifyEssentialSchema(prisma);
    console.log('Essential schema audit passed after migrations.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(
    sanitizeCommandOutput(
      error instanceof Error
        ? error.message
        : 'Unknown Railway pre-deploy failure.',
    ),
  );
  process.exitCode = 1;
});
