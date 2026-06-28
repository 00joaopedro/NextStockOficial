import {
  PartnerPaymentStatus,
  PartnerReferralStatus,
  Role,
} from '@prisma/client';
import { PartnerReferralsService } from './partner-referrals.service';

describe('PartnerReferralsService', () => {
  const dev = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'dev@example.com',
    role: Role.superAdmin,
    roles: [Role.superAdmin],
    isSuperAdmin: true,
  } as any;
  const referral = {
    id: '33333333-3333-4333-8333-333333333333',
    seenAt: null,
    convertedAt: null,
    status: PartnerReferralStatus.REGISTERED,
    paymentStatus: PartnerPaymentStatus.UNPAID,
  };

  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
  });

  afterEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
  });

  function prisma() {
    const formatted = {
      ...referral,
      systemType: 'padrao',
      registeredAt: new Date(),
      referredProfile: { email: 'indicado@example.com' },
      referredTenant: { id: 'tenant', name: 'Empresa' },
      referredBranch: { id: 'branch', name: 'Matriz' },
    };
    const tx = {
      partnerReferral: { update: jest.fn().mockResolvedValue(formatted) },
      partnerReferralPaymentEvent: {
        create: jest.fn().mockResolvedValue({ id: 'payment-event' }),
      },
      partnerReferralSeenEvent: {
        create: jest.fn().mockResolvedValue({ id: 'seen-event' }),
      },
    };
    return {
      tx,
      partner: { findFirst: jest.fn().mockResolvedValue({ id: 'partner' }) },
      partnerReferral: { findFirst: jest.fn().mockResolvedValue(referral) },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
  }

  it('pagamento cria evento manual com estado anterior e ator', async () => {
    const db = prisma();
    const service = new PartnerReferralsService(db);
    await service.updatePayment(dev, 'partner', referral.id, {
      paymentStatus: PartnerPaymentStatus.PAID,
      reason: 'Pagamento confirmado',
    });

    expect(db.tx.partnerReferralPaymentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousStatus: PartnerPaymentStatus.UNPAID,
        newStatus: PartnerPaymentStatus.PAID,
        changedById: dev.id,
      }),
    });
  });

  it('marcar visto nao altera paymentStatus e cria auditoria', async () => {
    const db = prisma();
    const service = new PartnerReferralsService(db);
    await service.updateSeen(dev, 'partner', referral.id, { seen: true });

    expect(db.tx.partnerReferral.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ paymentStatus: expect.anything() }),
      }),
    );
    expect(db.tx.partnerReferralSeenEvent.create).toHaveBeenCalled();
  });

  it('sempre valida referralId junto com partnerId', async () => {
    const db = prisma();
    const service = new PartnerReferralsService(db);
    await service.updateSeen(dev, 'partner-correto', referral.id, { seen: true });
    expect(db.partnerReferral.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: referral.id,
          partnerId: 'partner-correto',
        }),
      }),
    );
  });
});
