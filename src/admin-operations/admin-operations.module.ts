import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminOperationService } from './admin-operation.service';

@Module({
  imports: [PrismaModule],
  providers: [AdminOperationService],
  exports: [AdminOperationService],
})
export class AdminOperationsModule {}
