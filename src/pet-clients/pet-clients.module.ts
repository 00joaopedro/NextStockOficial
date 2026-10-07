import { Module } from '@nestjs/common';
import { UsageModule } from '../usage/usage.module';
import { StorageModule } from '../storage/storage.module';
import { PetClientsController } from './pet-clients.controller';
import { PetClientsService } from './pet-clients.service';

@Module({
  imports: [UsageModule, StorageModule],
  controllers: [PetClientsController],
  providers: [PetClientsService],
  exports: [PetClientsService],
})
export class PetClientsModule {}
