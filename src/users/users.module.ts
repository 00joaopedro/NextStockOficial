import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';
import { SessionsModule } from '../sessions/sessions.module';
import {
  SupabaseUserAuthAdapter,
  USER_AUTH_ADAPTER,
} from './user-auth.adapter';

@Module({
  imports: [PrismaModule, AuthModule, SessionsModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    SupabaseUserAuthAdapter,
    { provide: USER_AUTH_ADAPTER, useExisting: SupabaseUserAuthAdapter },
  ],
})
export class UsersModule {}
