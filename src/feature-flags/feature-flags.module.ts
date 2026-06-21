import { Global, Module } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';
import { DemoOnlyGuard } from './demo-only.guard';

@Global()
@Module({
  providers: [FeatureFlagService, DemoOnlyGuard],
  exports: [FeatureFlagService, DemoOnlyGuard],
})
export class FeatureFlagsModule {}
