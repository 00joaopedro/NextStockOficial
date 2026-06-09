import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { UsageModule } from '../usage/usage.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [UsageModule, StorageModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
