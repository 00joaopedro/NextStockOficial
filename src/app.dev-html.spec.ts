import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DevSuperAdminGuard } from './auth/dev-super-admin.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Injectable()
class HeaderJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userType = request.headers['x-test-user'];

    if (!userType) {
      throw new UnauthorizedException('Sessao invalida ou ausente.');
    }

    request.user =
      userType === 'dev'
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
            isSuperAdmin: false,
          };

    return true;
  }
}

describe('GET /dev.html protection', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
    process.env.DEV_SUPER_ADMIN_USER_IDS = '';

    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        DevSuperAdminGuard,
        JwtAuthGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderJwtGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sem login nao entrega HTML', async () => {
    const response = await app.inject({ method: 'GET', url: '/dev.html' });

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('NextStock Dev');
  });

  it('admin comum nao entrega HTML', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dev.html',
      headers: { 'x-test-user': 'admin' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('NextStock Dev');
  });

  it('Dev SuperAdmin entrega HTML', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dev.html',
      headers: { 'x-test-user': 'dev' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('NextStock Dev');
  });

  it('protege parceiros.html com a mesma allowlist Dev', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: '/parceiros.html',
    });
    const admin = await app.inject({
      method: 'GET',
      url: '/parceiros.html',
      headers: { 'x-test-user': 'admin' },
    });
    const dev = await app.inject({
      method: 'GET',
      url: '/parceiros.html',
      headers: { 'x-test-user': 'dev' },
    });

    expect(anonymous.statusCode).toBe(401);
    expect(admin.statusCode).toBe(403);
    expect(dev.statusCode).toBe(200);
    expect(dev.body).toContain('Control-plane comercial do NextStock');
  });
});
