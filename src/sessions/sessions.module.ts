import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
