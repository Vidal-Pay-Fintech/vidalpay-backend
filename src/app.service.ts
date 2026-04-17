import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    const swaggerEnabled =
      process.env.ENABLE_SWAGGER === 'true' ||
      process.env.NODE_ENV !== 'production';

    return {
      service: 'vidalpay-backend',
      status: 'ok',
      apiBasePath: '/api/v1',
      health: '/api/v1/health',
      readiness: '/api/v1/ready',
      docs: swaggerEnabled ? '/api-docs' : null,
    };
  }
}
