import { Module } from '@nestjs/common';
import { UsageModule } from '../usage/usage.module';
import { PetClientsController } from './pet-clients.controller';
import { PetClientsService } from './pet-clients.service';

@Module({
  imports: [UsageModule],
  controllers: [PetClientsController],
  providers: [PetClientsService],
  exports: [PetClientsService],
})
export class PetClientsModule {}
