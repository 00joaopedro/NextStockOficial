import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { DevSuperAdminGuard } from '../auth/dev-super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { PartnerReferralsService } from './partner-referrals.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Injectable()
class TestJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const kind = req.headers['x-test-user'];
    if (!kind) throw new UnauthorizedException();
    req.user =
      kind === 'dev'
        ? {
            id: 'dev-id',
            email: 'dev@example.com',
            role: 'superAdmin',
            roles: ['superAdmin'],
            isSuperAdmin: true,
          }
        : {
            id: 'admin-id',
            email: 'admin@example.com',
            role: 'Admin',
            roles: ['Admin'],
          };
    return true;
  }
}

@Injectable()
class AllowGuard implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('PartnersController authorization', () => {
  let app: INestApplication;
  const partners = {
    findAll: jest.fn().mockResolvedValue({ items: [], metrics: {} }),
  };

  beforeAll(async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
    const moduleRef = await Test.createTestingModule({
      controllers: [PartnersController],
      providers: [
        DevSuperAdminGuard,
        JwtAuthGuard,
        { provide: PartnersService, useValue: partners },
        { provide: PartnerReferralsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtGuard)
      .overrideGuard(PreviewMutationGuard)
      .useClass(AllowGuard)
      .overrideGuard(CsrfOriginGuard)
      .useClass(AllowGuard)
      .compile();
    app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
    await app?.close();
  });

  it('nega anonimo e Admin comum, permite somente Dev allowlisted', async () => {
    expect((await request(app.getHttpServer()).get('/partners')).status).toBe(
      401,
    );
    expect(
      (
        await request(app.getHttpServer())
          .get('/partners')
          .set('x-test-user', 'admin')
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .get('/partners')
          .set('x-test-user', 'dev')
      ).status,
    ).toBe(200);
  });
});
