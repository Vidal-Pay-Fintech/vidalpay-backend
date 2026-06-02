import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ProviderStatusService } from 'src/providers/provider-status.service';

@Injectable()
export class VersionService {
  private readonly packageVersion = this.readPackageVersion();

  constructor(
    private readonly configService: ConfigService,
    private readonly providerStatusService: ProviderStatusService,
  ) {}

  getVersion() {
    return {
      application: {
        name: this.configService.get('APP_NAME') ?? 'vidalpay-backend',
        version: this.packageVersion,
      },
      environment: this.configService.get('NODE_ENV') ?? 'development',
      buildTimestamp:
        this.configService.get('BUILD_TIMESTAMP') ?? new Date().toISOString(),
      commitSha:
        this.configService.get('RENDER_GIT_COMMIT') ||
        this.configService.get('COMMIT_SHA') ||
        null,
      providerModes: this.providerStatusService.getProviderModes(),
    };
  }

  private readPackageVersion() {
    try {
      const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
      ) as { version?: string };
      return packageJson.version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
