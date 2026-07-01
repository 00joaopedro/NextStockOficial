import { Global, Module } from '@nestjs/common';
import { CacheInvalidationInterceptor } from './cache-invalidation.interceptor';
import { PerformanceCacheService } from './performance-cache.service';

@Global()
@Module({
  providers: [PerformanceCacheService, CacheInvalidationInterceptor],
  exports: [PerformanceCacheService, CacheInvalidationInterceptor],
})
export class PerformanceModule {}
