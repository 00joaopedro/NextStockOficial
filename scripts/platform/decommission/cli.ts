import { PrismaClient } from '@prisma/client';
import { loadConfig } from './config';
import { evaluateAuth, evaluateStorage, reportHash } from './readiness';

function safeDatabase(value: string | undefined) {
  if (!value) return undefined;
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}:${url.port || '5432'}/${url.pathname.slice(1)}`;
}

async function main() {
  const config = loadConfig();
  const json = process.argv.includes('--json');
  const databaseUrl = config.databaseUrl;
  const auth = {
    profiles: 0,
    supabaseIdentities: 0,
    supertokensIdentities: 0,
    migratedLinked: 0,
    canonicalEmailCollisions: 0,
    missingCanonicalEmail: 0,
    activeLegacySessions: 0,
    recoveryReady: 0,
    compensationRequired: 0,
  };
  const storage = {
    total: 0,
    verifiedGcs: 0,
    supabaseOnly: 0,
    copyPending: 0,
    processing: 0,
    failedFinal: 0,
    hashMismatch: 0,
    sizeMismatch: 0,
    missingTarget: 0,
    invalidTenantPath: 0,
    reservationPending: 0,
  };
  let prisma: PrismaClient | undefined;
  try {
    if (databaseUrl) {
      prisma = new PrismaClient({ datasourceUrl: databaseUrl });
      auth.profiles = await prisma.userProfile.count();
      auth.supabaseIdentities = await prisma.authIdentity.count({
        where: { provider: 'supabase' },
      });
      auth.supertokensIdentities = await prisma.authIdentity.count({
        where: { provider: 'supertokens' },
      });
      auth.migratedLinked = await prisma.authIdentity.count({
        where: { provider: 'supertokens', status: 'active' },
      });
      auth.activeLegacySessions = await prisma.userSession.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      });
      storage.total = await prisma.storedFile.count({
        where: { status: 'ACTIVE' },
      });
      storage.supabaseOnly = storage.total;
    }
    const authGate = evaluateAuth(auth, config.providerReady);
    const storageGate = evaluateStorage(storage, config.providerReady);
    const needsAuth =
      config.target === 'supertokens-only' || config.scope === 'auth';
    const needsStorage =
      config.target === 'gcs-only' || config.scope === 'storage';
    const blockers =
      config.target === 'coexistence'
        ? []
        : [
            ...(needsAuth ? authGate.blockers : []),
            ...(needsStorage ? storageGate.blockers : []),
            ...(!databaseUrl ? ['DATABASE_NOT_PROVIDED'] : []),
          ];
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      target: config.target,
      dryRun: config.dryRun,
      database: safeDatabase(databaseUrl),
      auth: authGate.summary,
      storage: storageGate.summary,
      blockers: [...new Set(blockers)],
      decision: blockers.length === 0 ? 'GO' : 'NO_GO',
      realCutoverApproved: false,
    };
    const output = { ...report, summaryHash: reportHash(report) };
    console.log(
      json
        ? JSON.stringify(output)
        : `decommission decision: ${output.decision}`,
    );
    if (blockers.length > 0) process.exitCode = 2;
  } finally {
    await prisma?.$disconnect();
  }
}

void main();
