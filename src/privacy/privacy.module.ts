import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [PrismaModule],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
