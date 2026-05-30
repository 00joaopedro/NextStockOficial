import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { UsageController } from './usage.controller';
import { UsageInterceptor } from './usage.interceptor';
import { UsageService } from './usage.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsageController],
  providers: [UsageService, UsageInterceptor, JwtAuthGuard],
  exports: [UsageService, UsageInterceptor],
})
export class UsageModule {}
