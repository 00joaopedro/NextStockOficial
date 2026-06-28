import { CanActivate, ExecutionContext, Injectable, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
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
  let app: INestApplication;

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

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sem login nao entrega HTML', async () => {
    const response = await request(app.getHttpServer()).get('/dev.html');

    expect(response.status).toBe(401);
    expect(response.text).not.toContain('NextStock Dev');
  });

  it('admin comum nao entrega HTML', async () => {
    const response = await request(app.getHttpServer())
      .get('/dev.html')
      .set('x-test-user', 'admin');

    expect(response.status).toBe(403);
    expect(response.text).not.toContain('NextStock Dev');
  });

  it('Dev SuperAdmin entrega HTML', async () => {
    const response = await request(app.getHttpServer())
      .get('/dev.html')
      .set('x-test-user', 'dev');

    expect(response.status).toBe(200);
    expect(response.text).toContain('NextStock Dev');
  });

  it('protege parceiros.html com a mesma allowlist Dev', async () => {
    const anonymous = await request(app.getHttpServer()).get('/parceiros.html');
    const admin = await request(app.getHttpServer())
      .get('/parceiros.html')
      .set('x-test-user', 'admin');
    const dev = await request(app.getHttpServer())
      .get('/parceiros.html')
      .set('x-test-user', 'dev');

    expect(anonymous.status).toBe(401);
    expect(admin.status).toBe(403);
    expect(dev.status).toBe(200);
    expect(dev.text).toContain('Control-plane comercial do NextStock');
  });
});
