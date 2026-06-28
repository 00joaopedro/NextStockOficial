import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SupabaseModule } from './supabase/supabase.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { TenantsModule } from './tenants/tenants.module';
import { SystemModule } from './system/system.module';
import { AgendaPetModule } from './agenda-pet/agenda-pet.module';
import { ProfileModule } from './profile/profile.module';
import { PaymentMachinesModule } from './payment-machines/payment-machines.module';
import { ProductsModule } from './products/products.module';
import { DevModule } from './dev/dev.module';
import { PetClientsModule } from './pet-clients/pet-clients.module';
import { PetsModule } from './pets/pets.module';
import { StorageModule } from './storage/storage.module';
import { OrdersModule } from './orders/orders.module';
import { EmployeesModule } from './employees/employees.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { SalesModule } from './sales/sales.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PartnersModule } from './partners/partners.module';

const publicPath = join(__dirname, '..', 'public');

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: existsSync(publicPath)
        ? publicPath
        : join(__dirname, '..', '..', 'public'),
      exclude: ['/api', '/api/*path', '/dev.html', '/parceiros.html'],
    }),
    PrismaModule,
    TenancyModule,
    SupabaseModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    SystemModule,
    AgendaPetModule,
    ProfileModule,
    PaymentMachinesModule,
    ProductsModule,
    StorageModule,
    PetClientsModule,
    PetsModule,
    DevModule,
    SalesModule,
    FiscalModule,
    OrdersModule,
    EmployeesModule,
    SuppliersModule,
    ExpensesModule,
    DashboardModule,
    PartnersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
