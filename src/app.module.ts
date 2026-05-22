import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
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

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/',
      exclude: [
        '/auth/*authPath',
        '/health',
        '/users/*usersPath',
        '/tenants/*tenantsPath',
        '/profile/*profilePath',
        '/payment-machines/*paymentMachinesPath',
        '/products/*productsPath',
        '/system/*systemPath',
        '/api/*apiPath',
        '/agenda-pet/*agendaPetPath',
      ],
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
