import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { SupabaseModule } from '../supabase/supabase.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsageModule } from '../usage/usage.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DevSuperAdminGuard } from './dev-super-admin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ReferralModule } from '../partners/referral.module';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthRateLimitStore } from './auth-rate-limit.store';
import { BillingCoreModule } from '../billing/billing-core.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ObservabilityModule } from '../observability/observability.module';
import { AUTH_IDENTITY_PROVIDER } from './auth-provider';
import { SupabaseAuthProvider } from './supabase-auth-provider';

@Module({
  imports: [
    SupabaseModule,
    PrismaModule,
    PassportModule,
    UsageModule,
    TenancyModule,
    ReferralModule,
    BillingCoreModule,
    SessionsModule,
    ObservabilityModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    DevSuperAdminGuard,
    PublicRateLimitGuard,
    AuthRateLimitGuard,
    AuthRateLimitStore,
    SupabaseAuthProvider,
    { provide: AUTH_IDENTITY_PROVIDER, useExisting: SupabaseAuthProvider },
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    DevSuperAdminGuard,
    AUTH_IDENTITY_PROVIDER,
  ],
})
export class AuthModule {}
