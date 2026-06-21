import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagService } from './feature-flag.service';
import {
  DEMO_FEATURE_KEY,
  FeatureFlagKey,
} from './feature-flags.constants';

@Injectable()
export class DemoOnlyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<FeatureFlagKey>(
      DEMO_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    this.featureFlags.assertDemoEnabled(feature);
    return true;
  }
}
