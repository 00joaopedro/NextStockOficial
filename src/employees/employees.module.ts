import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { SystemModule } from '../system/system.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [
    PrismaModule,
    SupabaseModule,
    TenancyModule,
    SystemModule,
    SessionsModule,
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
