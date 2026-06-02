import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';

@ApiTags('Health')
@Auth(AuthType.None)
@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('health')
  getHealth() {
    return {
      service: process.env.APP_NAME ?? 'vidalpay-backend',
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'development',
      apiBasePath: '/api/v1',
      docs: {
        enabled: this.isSwaggerEnabled(),
        path: this.isSwaggerEnabled() ? '/api-docs' : null,
      },
      build: {
        commit:
          process.env.RENDER_GIT_COMMIT ?? process.env.COMMIT_SHA ?? null,
        renderServiceId: process.env.RENDER_SERVICE_ID ?? null,
      },
    };
  }

  @Get('ready')
  async getReadiness() {
    const database = await this.checkDatabase();

    return {
      service: process.env.APP_NAME ?? 'vidalpay-backend',
      status: database.connected ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      apiBasePath: '/api/v1',
      database,
      build: {
        commit:
          process.env.RENDER_GIT_COMMIT ?? process.env.COMMIT_SHA ?? null,
        renderServiceId: process.env.RENDER_SERVICE_ID ?? null,
      },
    };
  }

  private async checkDatabase() {
    try {
      await this.dataSource.query('SELECT 1');

      return {
        connected: true,
        initialized: this.dataSource.isInitialized,
      };
    } catch (error) {
      return {
        connected: false,
        initialized: this.dataSource.isInitialized,
        reason:
          error instanceof Error ? error.message : 'Database check failed.',
      };
    }
  }

  private isSwaggerEnabled() {
    return (
      process.env.ENABLE_SWAGGER === 'true' ||
      process.env.NODE_ENV !== 'production'
    );
  }
}
