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
          isUniversal: false,
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
      select: { id: true, systemType: true, isUniversal: true },
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


describe('ReferralRegistrationService universal links', () => {
  const code = 'B'.repeat(43);

  it('exige e registra o modo escolhido para link universal', async () => {
    const prisma = {
      partner: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'partner',
          systemType: SystemType.padrao,
          isUniversal: true,
        }),
      },
    } as any;
    const service = new ReferralRegistrationService(prisma);
    await expect(service.resolveActive(code, SystemType.petshop)).resolves.toEqual({
      partnerId: 'partner',
      systemType: SystemType.petshop,
    });
  });

  it('rejeita modo não permitido no link universal', async () => {
    const prisma = {
      partner: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'partner',
          systemType: SystemType.padrao,
          isUniversal: true,
        }),
      },
    } as any;
    const service = new ReferralRegistrationService(prisma);
    await expect(service.resolveActive(code, 'invalido')).resolves.toBeNull();
  });
});
