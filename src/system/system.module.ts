import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PreviewMutationGuard } from './guards/preview-mutation.guard';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [AuthModule],
  controllers: [SystemController],
  providers: [SystemService, PreviewMutationGuard],
  exports: [SystemService, PreviewMutationGuard],
})
export class SystemModule {}
