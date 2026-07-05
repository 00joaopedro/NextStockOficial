import { PrivacyService } from './privacy.service';

describe('PrivacyService', () => {
  it('returns only a dry-run anonymization plan preserving fiscal data', () => {
    const service = new PrivacyService({} as any);
    expect(service.anonymizationPlan('profile-1')).toMatchObject({
      profileId: 'profile-1',
      dryRun: true,
      preserve: expect.arrayContaining(['sales', 'sale_documents']),
    });
  });

  it('builds a tenant-scoped export manifest without secrets', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockReturnValue(Promise.resolve(null)) },
      branch: { findMany: jest.fn().mockReturnValue(Promise.resolve([])) },
      tenantMember: {
        findMany: jest.fn().mockReturnValue(Promise.resolve([])),
      },
      employee: { findMany: jest.fn().mockReturnValue(Promise.resolve([])) },
      petClient: { findMany: jest.fn().mockReturnValue(Promise.resolve([])) },
      pet: { findMany: jest.fn().mockReturnValue(Promise.resolve([])) },
      order: { findMany: jest.fn().mockReturnValue(Promise.resolve([])) },
      sale: { findMany: jest.fn().mockReturnValue(Promise.resolve([])) },
      expense: { findMany: jest.fn().mockReturnValue(Promise.resolve([])) },
      storedFile: { findMany: jest.fn().mockReturnValue(Promise.resolve([])) },
      $transaction: jest.fn((queries) => Promise.all(queries)),
    };
    const service = new PrivacyService(prisma as any);
    const result = await service.buildTenantExportManifest('tenant-1');
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
    );
    expect(result.excluded).toContain('tokens');
    expect(JSON.stringify(result)).not.toContain('signedUrl');
  });
});
