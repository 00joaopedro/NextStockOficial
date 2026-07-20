import 'dotenv/config';
import { spawnSync } from 'child_process';
import { validateMigrationTarget } from './validate-target-lib';
import {
  administrativePrisma,
  inspectMigrationState,
  INTERNAL_RECEIPT_ENUM_MIGRATION,
  sanitizeCommandOutput,
} from './migration-inspection';

async function main() {
  validateMigrationTarget(process.env);
  const prisma = administrativePrisma();
  try {
    const state = await inspectMigrationState(prisma);
    const failed = state.failed.filter(
      (row) => row.migration_name === INTERNAL_RECEIPT_ENUM_MIGRATION,
    );
    if (failed.length !== 1) {
      throw new Error(
        `Repair refused: expected exactly one unresolved ${INTERNAL_RECEIPT_ENUM_MIGRATION} row, found ${failed.length}.`,
      );
    }

    console.log(
      `Verified failed migration ${INTERNAL_RECEIPT_ENUM_MIGRATION}; internal_issued enum is ${state.internalReceiptEnumExists ? 'present' : 'absent'}.`,
    );
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(
      command,
      [
        'prisma',
        'migrate',
        'resolve',
        '--rolled-back',
        INTERNAL_RECEIPT_ENUM_MIGRATION,
      ],
      { env: process.env, encoding: 'utf8' },
    );
    const output = sanitizeCommandOutput(
      `${result.stdout || ''}${result.stderr || ''}`,
    );
    if (output) console.log(output);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `Prisma migrate resolve failed with exit code ${result.status}.`,
      );
    }
    console.log(
      'Failed migration marked rolled back after catalog verification. Run npm run railway:migrate to retry the current append-only-safe chain.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(
    sanitizeCommandOutput(
      error instanceof Error
        ? error.message
        : 'Unknown migration repair failure.',
    ),
  );
  process.exitCode = 1;
});
