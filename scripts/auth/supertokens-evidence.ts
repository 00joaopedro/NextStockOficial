import { readFile } from 'node:fs/promises';
import { PasswordHashRecord } from './supertokens-password-import';

export type SanitizedEvidence = {
  formatVersion: 1;
  records: PasswordHashRecord[];
  aggregates: { legacySessions: number; reconciliationPending?: number };
};

export async function readEvidence(path: string): Promise<SanitizedEvidence> {
  if (!path) throw new Error('INVENTORY_SOURCE_REQUIRED');
  const input = JSON.parse(await readFile(path, 'utf8')) as Record<
    string,
    unknown
  >;
  if (
    input.formatVersion !== 1 ||
    !Array.isArray(input.records) ||
    !input.aggregates ||
    typeof input.aggregates !== 'object'
  )
    throw new Error('INVENTORY_SCHEMA_INVALID');
  const aggregates = input.aggregates as Record<string, unknown>;
  if (
    !Number.isSafeInteger(aggregates.legacySessions) ||
    (aggregates.legacySessions as number) < 0
  )
    throw new Error('LEGACY_SESSION_COUNT_UNPROVEN');
  if (
    aggregates.reconciliationPending !== undefined &&
    (!Number.isSafeInteger(aggregates.reconciliationPending) ||
      (aggregates.reconciliationPending as number) < 0)
  )
    throw new Error('RECONCILIATION_SOURCE_INVALID');
  return {
    formatVersion: 1,
    records: input.records as PasswordHashRecord[],
    aggregates: aggregates as SanitizedEvidence['aggregates'],
  };
}
