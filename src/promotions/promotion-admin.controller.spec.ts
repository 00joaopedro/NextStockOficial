import { BadRequestException } from '@nestjs/common';
import { PromotionAdminController } from './promotion-admin.controller';

describe('PromotionAdminController capacity update', () => {
  const audit = {
    fromRequest: jest.fn().mockReturnValue({
      requestId: 'request-1',
      actorProfileId: 'profile-1',
      actorRole: 'DEV_SUPERADMIN',
    }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('requires the explicit capacity confirmation', async () => {
    const promotions = { updateCapacity: jest.fn() };
    const controller = new PromotionAdminController(
      promotions as any,
      audit as any,
    );

    await expect(
      controller.updateCapacity(
        {} as any,
        'lancamento-2026',
        { maxConversions: 50, confirmation: '50' },
        'capacity-update-0001',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(promotions.updateCapacity).not.toHaveBeenCalled();
  });

  it('forwards the protected request with an idempotency key', async () => {
    const campaign = { id: 'campaign-1', maxConversions: 50 };
    const promotions = {
      updateCapacity: jest.fn().mockResolvedValue({ campaign }),
    };
    const controller = new PromotionAdminController(
      promotions as any,
      audit as any,
    );

    await expect(
      controller.updateCapacity(
        {} as any,
        'lancamento-2026',
        { maxConversions: 50, confirmation: 'ATUALIZAR VAGAS' },
        'capacity-update-0002',
      ),
    ).resolves.toEqual(campaign);
    expect(promotions.updateCapacity).toHaveBeenCalledWith(
      'lancamento-2026',
      50,
      'capacity-update-0002',
      expect.objectContaining({
        requestId: 'request-1',
        ipHash: undefined,
        userAgentHash: undefined,
      }),
    );
  });
});
