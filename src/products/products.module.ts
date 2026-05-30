import { Module } from '@nestjs/common';
import { UsageModule } from '../usage/usage.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [UsageModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
