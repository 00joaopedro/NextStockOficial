import { Module } from '@nestjs/common';
import { ReferralRegistrationService } from './referral-registration.service';

@Module({
  providers: [ReferralRegistrationService],
  exports: [ReferralRegistrationService],
})
export class ReferralModule {}
