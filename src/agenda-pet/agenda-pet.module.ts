import { Module } from '@nestjs/common';
import { AgendaPetService } from './agenda-pet.service';
import { AgendaPetController } from './agenda-pet.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AgendaPetController],
  providers: [AgendaPetService],
})
export class AgendaPetModule {}
