import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PreviewMutationGuard } from './guards/preview-mutation.guard';
import { PreviewMutationInterceptor } from './interceptors/preview-mutation.interceptor';
import { PreviewModePolicyService } from './preview-mode-policy.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [AuthModule],
  controllers: [SystemController],
  providers: [
    SystemService,
    PreviewModePolicyService,
    PreviewMutationGuard,
    PreviewMutationInterceptor,
  ],
  exports: [
    SystemService,
    PreviewModePolicyService,
    PreviewMutationGuard,
    PreviewMutationInterceptor,
  ],
})
export class SystemModule {}
