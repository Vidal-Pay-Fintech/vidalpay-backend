import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FEATURE_FLAG_DESCRIPTIONS,
  FEATURE_FLAGS,
  FeatureFlagKey,
} from './feature-flags.constants';

@Injectable()
export class FeatureFlagService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(flag: FeatureFlagKey): boolean {
    const value = this.configService.get<string>(flag) ?? process.env[flag];
    return String(value ?? '').toLowerCase() === 'true';
  }

  assertEnabled(flag: FeatureFlagKey) {
    if (!this.isEnabled(flag)) {
      throw new ServiceUnavailableException(
        `${flag} is disabled for this environment.`,
      );
    }
  }

  assertDemoEnabled() {
    if (!this.isEnabled('ENABLE_DEMO_MODE')) {
      throw new ForbiddenException(
        'Demo operation disabled in this environment.',
      );
    }
  }

  getAll() {
    return FEATURE_FLAGS.map((flag) => ({
      flag,
      enabled: this.isEnabled(flag),
      description: FEATURE_FLAG_DESCRIPTIONS[flag],
    }));
  }
}
