import { readFileSync } from 'fs';
import { join } from 'path';
import { sanitizeCommandOutput } from '../scripts/migrations/migration-inspection';
import { verifyEssentialSchema } from '../scripts/migrations/essential-schema';

describe('Railway migration pre-deploy', () => {
  it('keeps migrations separate from application start', () => {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
    );
    const railway = JSON.parse(
      readFileSync(join(__dirname, '..', 'railway.json'), 'utf8'),
    );

    expect(railway.deploy.preDeployCommand).toBe('npm run railway:migrate');
    expect(railway.deploy.startCommand).toBe('npm run start:railway');
    expect(packageJson.scripts['start:railway']).toBe('npm run start:prod');
    expect(packageJson.scripts['start:prod']).not.toMatch(/prisma|migrate/i);
    expect(packageJson.scripts['railway:migrate']).toContain(
      'railway-predeploy.ts',
    );
  });

  it('redacts database URLs from command failures', () => {
    const sanitized = sanitizeCommandOutput(
      'failed postgresql://user:secret@db.example.test:5432/postgres details',
    );

    expect(sanitized).toContain('[REDACTED_DATABASE_URL]');
    expect(sanitized).not.toContain('secret');
  });

  it('repairs the known failed enum migration as rolled back, never as applied', () => {
    const repair = readFileSync(
      join(
        __dirname,
        '..',
        'scripts',
        'migrations',
        'repair-internal-receipt.ts',
      ),
      'utf8',
    );

    expect(repair).toContain("'--rolled-back'");
    expect(repair).not.toContain("'--applied'");
    expect(repair).toContain('internalReceiptEnumExists');
  });

  it('fails the post-migration audit when an essential table is absent', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { table_name: 'profiles' },
          { table_name: 'branches' },
          { table_name: 'tenant_members' },
          { table_name: 'security_audit_events' },
        ]),
    };

    await expect(verifyEssentialSchema(prisma as any)).rejects.toThrow(
      'missing tables: tenants',
    );
  });
});
