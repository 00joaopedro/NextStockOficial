import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOperationsModule } from '../admin-operations/admin-operations.module';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { PromotionsController } from './promotions.controller';
import { PromotionAdminController } from './promotion-admin.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [AuthModule, AdminOperationsModule],
  controllers: [PromotionsController, PromotionAdminController],
  providers: [PromotionsService, PublicRateLimitGuard],
  exports: [PromotionsService],
})
export class PromotionsModule {}
