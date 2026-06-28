import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PartnerLinkStatus,
  Role,
  SystemType,
} from '@prisma/client';
import { PartnersService } from './partners.service';

describe('PartnersService', () => {
  const dev = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'dev@example.com',
    role: Role.superAdmin,
    roles: [Role.superAdmin],
    isSuperAdmin: true,
    isDevSuperAdmin: true,
  } as any;
  const partner = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Parceiro',
    phone: '+5591999999999',
    bankNumber: '260',
    referralCode: 'x'.repeat(43),
    referralCodeHash: 'secret-hash',
    referralCodePrefix: 'xxxxxxxx',
    linkStatus: PartnerLinkStatus.ACTIVE,
    systemType: SystemType.padrao,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    _count: { referrals: 0 },
  };

  beforeEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
  });

  afterEach(() => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
  });

  function prisma() {
    const tx = {
      partner: {
        create: jest.fn().mockResolvedValue(partner),
        update: jest.fn().mockResolvedValue(partner),
      },
      partnerLinkEvent: { create: jest.fn().mockResolvedValue({ id: 'event' }) },
    };
    return {
      tx,
      partner: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      partnerReferral: { count: jest.fn() },
      $transaction: jest.fn((input) =>
        typeof input === 'function' ? input(tx) : Promise.all(input),
      ),
    } as any;
  }

  it('bloqueia Admin comum mesmo com chamada direta ao service', async () => {
    const service = new PartnersService(prisma());
    await expect(
      service.findAll(
        { ...dev, role: Role.Admin, roles: [Role.Admin], isSuperAdmin: false } as any,
        { page: 1, limit: 20 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gera token de alta entropia e nao retorna hash', async () => {
    const db = prisma();
    const service = new PartnersService(db);
    const result = await service.create(dev, {
      name: partner.name,
      phone: partner.phone,
      bankNumber: partner.bankNumber,
      systemType: SystemType.padrao,
    });
    const data = db.tx.partner.create.mock.calls[0][0].data;

    expect(data.referralCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.referralCodeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('referralCodeHash');
    expect(JSON.stringify(result)).not.toContain('secret-hash');
  });

  it('delete faz soft delete, revoga link e registra evento', async () => {
    const db = prisma();
    db.partner.findFirst.mockResolvedValue(partner);
    const service = new PartnersService(db);

    await service.remove(dev, partner.id);

    expect(db.tx.partner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          linkStatus: PartnerLinkStatus.REVOKED,
        }),
      }),
    );
    expect(db.tx.partnerLinkEvent.create).toHaveBeenCalled();
  });

  it('nao encontra parceiro removido ou fora do escopo ativo', async () => {
    const service = new PartnersService(prisma());
    await expect(service.findOne(dev, partner.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
