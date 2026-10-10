import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicRateLimitGuard } from '../security/public-rate-limit.guard';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [AuthModule],
  controllers: [PromotionsController],
  providers: [PromotionsService, PublicRateLimitGuard],
  exports: [PromotionsService],
})
export class PromotionsModule {}
