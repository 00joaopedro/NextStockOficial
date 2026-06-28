import { PartnerLinkStatus, SystemType } from '@prisma/client';
import { ReferralRegistrationService } from './referral-registration.service';

describe('ReferralRegistrationService', () => {
  const code = 'A'.repeat(43);

  it('resolve somente link ativo, nao removido e nao expirado', async () => {
    const prisma = {
      partner: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'partner',
          systemType: SystemType.petshop,
        }),
      },
    } as any;
    const service = new ReferralRegistrationService(prisma);
    await expect(service.resolveActive(code)).resolves.toEqual({
      partnerId: 'partner',
      systemType: SystemType.petshop,
    });
    expect(prisma.partner.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        linkStatus: PartnerLinkStatus.ACTIVE,
        deletedAt: null,
      }),
      select: { id: true, systemType: true },
    });
  });

  it('codigo inexistente retorna null sem expor dados', async () => {
    const prisma = {
      partner: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new ReferralRegistrationService(prisma);
    await expect(service.resolveActive(code)).resolves.toBeNull();
  });
});
