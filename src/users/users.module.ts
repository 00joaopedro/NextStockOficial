import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [PrismaModule, AuthModule, SupabaseModule, SessionsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
