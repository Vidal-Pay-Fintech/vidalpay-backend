import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import {
  DEMO_FEATURE_KEY,
  FeatureFlagKey,
} from './feature-flags.constants';
import { DemoOnlyGuard } from './demo-only.guard';

export function DemoOnly(feature?: FeatureFlagKey) {
  return applyDecorators(
    SetMetadata(DEMO_FEATURE_KEY, feature ?? 'ENABLE_DEMO_MODE'),
    UseGuards(DemoOnlyGuard),
  );
}
