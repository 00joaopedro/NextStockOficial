import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Role, SystemMode, SystemType } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../src/auth/optional-jwt-auth.guard';
import { DeterministicTestAuthGuard } from './test-auth.guard';

export async function createSecurityHttpApp() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtAuthGuard)
    .useClass(DeterministicTestAuthGuard)
    .overrideProvider(OptionalJwtAuthGuard)
    .useClass(DeterministicTestAuthGuard)
    .compile();
  const app = module.createNestApplication(new FastifyAdapter());
  const users = new Map<string, AuthenticatedUser>();
  const fastify = app.getHttpAdapter().getInstance() as {
    securityTestUsers?: Map<string, AuthenticatedUser>;
  };
  fastify.securityTestUsers = users;
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  return {
    app,
    registerUser(input: {
      id: string;
      email: string;
      role: Role;
      tenantId: string | null;
      branchId: string | null;
      systemType?: SystemType;
      mode?: SystemMode;
      isDevSuperAdmin?: boolean;
    }) {
      users.set(input.id, {
        id: input.id,
        email: input.email,
        name: 'Security Test',
        role: input.role,
        roles: [input.role],
        tenantId: input.tenantId,
        primaryTenantId: input.tenantId,
        tenant: null,
        branchId: input.branchId,
        branch: null,
        systemType: input.systemType ?? SystemType.padrao,
        mode: input.mode ?? SystemMode.padrao,
        branches: [],
        isSuperAdmin: input.role === Role.superAdmin,
        isDevSuperAdmin: input.isDevSuperAdmin,
      });
    },
  };
}
