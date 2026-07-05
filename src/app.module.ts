import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';

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
import { BillingModule } from './billing/billing.module';
import { BillingAccessInterceptor } from './billing/billing-access.interceptor';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CsrfOriginGuard } from './security/csrf-origin.guard';
import { validateEnvironment } from './config/environment';
import { PerformanceModule } from './performance/performance.module';
import { CacheInvalidationInterceptor } from './performance/cache-invalidation.interceptor';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { SessionsModule } from './sessions/sessions.module';
import { ObservabilityModule } from './observability/observability.module';
import { ObservabilityInterceptor } from './observability/observability.interceptor';
import { PrivacyModule } from './privacy/privacy.module';

const publicPath = join(__dirname, '..', 'public');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ServeStaticModule.forRoot({
      rootPath: existsSync(publicPath)
        ? publicPath
        : join(__dirname, '..', '..', 'public'),
      exclude: ['/api', '/api/*path', '/dev.html', '/parceiros.html'],
      serveStaticOptions: {
        etag: true,
        setHeaders(res, filePath) {
          if (/\.html$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
            return;
          }
          if (/\.[a-f0-9]{8,}\.(?:js|css|webp|png|jpg|jpeg|svg|woff2?)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
          }
          res.setHeader('Cache-Control', 'public, max-age=3600');
        },
      },
    }),
    PerformanceModule,
    AuditModule,
    SessionsModule,
    ObservabilityModule,
    PrivacyModule,
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
    BillingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CsrfOriginGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: BillingAccessInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInvalidationInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ObservabilityInterceptor,
    },
  ],
})
export class AppModule {}
