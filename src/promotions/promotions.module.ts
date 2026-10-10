import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { PromotionsController } from './promotions.controller';
import { PromotionAdminController } from './promotion-admin.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [AuthModule],
  controllers: [PromotionsController, PromotionAdminController],
  providers: [PromotionsService, PublicRateLimitGuard],
  exports: [PromotionsService],
})
export class PromotionsModule {}
