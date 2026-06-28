import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { CsrfOriginGuard } from '../security/csrf-origin.guard';
import { SystemModule } from '../system/system.module';
import { PartnerReferralsService } from './partner-referrals.service';
import {
  PartnersController,
  PublicReferralsController,
} from './partners.controller';
import { PartnersService } from './partners.service';
import { ReferralModule } from './referral.module';

@Module({
  imports: [AuthModule, ReferralModule, SystemModule],
  controllers: [PartnersController, PublicReferralsController],
  providers: [
    PartnersService,
    PartnerReferralsService,
    PublicRateLimitGuard,
    CsrfOriginGuard,
  ],
})
export class PartnersModule {}
