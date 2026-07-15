import { Test, TestingModule } from '@nestjs/testing';
import { CanActivate, ExecutionContext } from '@nestjs/common';
import * as request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { DevSuperAdminGuard } from './../src/auth/dev-super-admin.guard';
import { JwtAuthGuard } from './../src/auth/jwt-auth.guard';
import { RolesGuard } from './../src/auth/roles.guard';
import { CertificateService } from './../src/fiscal/certificate.service';
import { PreviewMutationGuard } from './../src/system/guards/preview-mutation.guard';
import { ProductsService } from './../src/products/products.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { PublicRateLimitGuard } from './../src/security/public-rate-limit.guard';
import { SessionsService } from './../src/sessions/sessions.service';
import { BranchContextGuard } from './../src/tenancy/branch-context.guard';

jest.setTimeout(120_000);

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

class SmokeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = {
      id: 'profile-smoke',
      email: 'smoke@example.com',
      role: 'Admin',
      roles: ['Admin', 'superAdmin'],
      isSuperAdmin: true,
      tenantId: 'tenant-smoke',
    };
    return true;
  }
}

class AllowGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.tenantContext = {
      tenantId: 'tenant-smoke',
      branchId: 'branch-smoke',
      membership: { role: 'Admin' },
    };
    return true;
  }
}

describe('App smoke (e2e)', () => {
  let app: NestExpressApplication;
  const authService = {
    login: jest.fn().mockResolvedValue({
      accessToken: 'smoke-token',
      payload: {
        message: 'Login realizado com sucesso.',
        user: {
          id: 'profile-smoke',
          email: 'smoke@example.com',
          role: 'Admin',
        },
      },
    }),
    getProfile: jest.fn().mockReturnValue({
      id: 'profile-smoke',
      email: 'smoke@example.com',
      role: 'Admin',
    }),
  };
  const productsService = {
    uploadImage: jest.fn().mockResolvedValue({
      ok: true,
      image: {
        id: 'image-smoke',
        productId: '11111111-1111-4111-8111-111111111111',
      },
    }),
  };
  const sessionsService = {
    expiresAtFromJwt: jest.fn().mockReturnValue({
      subject: 'auth-smoke',
      expiresAt: new Date(Date.now() + 60_000),
    }),
    create: jest.fn().mockResolvedValue({
      token: 'session-smoke',
      expiresAt: new Date(Date.now() + 60_000),
    }),
    revokeCurrent: jest.fn().mockResolvedValue(1),
    metadataFromRequest: jest.fn().mockReturnValue({}),
  };
  const certificateService = {
    upload: jest.fn().mockResolvedValue({
      ok: true,
      certificate: { present: true, status: 'valid' },
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .overrideProvider(AuthService)
      .useValue(authService)
      .overrideProvider(ProductsService)
      .useValue(productsService)
      .overrideProvider(SessionsService)
      .useValue(sessionsService)
      .overrideProvider(CertificateService)
      .useValue(certificateService)
      .overrideGuard(JwtAuthGuard)
      .useClass(SmokeAuthGuard)
      .overrideGuard(DevSuperAdminGuard)
      .useClass(AllowGuard)
      .overrideGuard(RolesGuard)
      .useClass(AllowGuard)
      .overrideGuard(BranchContextGuard)
      .useClass(AllowGuard)
      .overrideGuard(PreviewMutationGuard)
      .useClass(AllowGuard)
      .overrideGuard(PublicRateLimitGuard)
      .useClass(AllowGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(join(process.cwd(), 'public'));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api health endpoints respond', async () => {
    await request(app.getHttpServer()).get('/api').expect(200).expect({
      status: 'ok',
      app: 'NextStock',
      message: 'API online',
    });
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect({
        status: 'ready',
        database: 'available',
      });
  });

  it('login, profile and logout respond through /api/auth', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'smoke@example.com', password: 'Senha123' })
      .expect(201)
      .expect(({ body }) =>
        expect(body.message).toBe('Login realizado com sucesso.'),
      );

    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .expect(200)
      .expect(({ body }) => expect(body.email).toBe('smoke@example.com'));

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .expect(201)
      .expect({ ok: true });
  });

  it('upload endpoints accept multipart files', async () => {
    await request(app.getHttpServer())
      .post('/api/products/11111111-1111-4111-8111-111111111111/images/upload')
      .attach('file', Buffer.from('fake image'), {
        filename: 'produto.png',
        contentType: 'image/png',
      })
      .expect(201)
      .expect(({ body }) => expect(body.ok).toBe(true));

    await request(app.getHttpServer())
      .post('/api/fiscal/certificate/upload')
      .field('password', 'senha-certificado')
      .attach('file', Buffer.from('fake pfx'), {
        filename: 'certificado.pfx',
        contentType: 'application/x-pkcs12',
      })
      .expect(201)
      .expect(({ body }) => expect(body.certificate.present).toBe(true));
  });

  it('serves public html smoke pages', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /html/);
    await request(app.getHttpServer())
      .get('/dev.html')
      .expect(200)
      .expect(({ text }) => {
        expect(text).toContain('NextStock Dev');
      });
    await request(app.getHttpServer())
      .get('/parceiros.html')
      .expect(200)
      .expect(({ text }) => {
        expect(text).toContain('Control-plane comercial do NextStock');
      });
  });
});
