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
import { BillingCoreModule } from '../billing/billing-core.module';
import { SessionsModule } from '../sessions/sessions.module';

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
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    DevSuperAdminGuard,
    PublicRateLimitGuard,
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    DevSuperAdminGuard,
  ],
})
export class AuthModule {}
