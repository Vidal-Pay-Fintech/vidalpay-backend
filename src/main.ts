import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { ResponseInterceptor } from './common/filters/success.filter';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    cors: false,
  });
  const trustProxyHops = Math.max(
    0,
    Number(process.env.TRUST_PROXY_HOPS ?? '1'),
  );
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  const swaggerEnabled =
    process.env.ENABLE_SWAGGER === 'true' ||
    process.env.NODE_ENV !== 'production';

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.use(cookieParser());

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  app.use(
    bodyParser.json({
      limit: '50mb',
      verify: (req: any, _res, buffer) => {
        req.rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({
    origin: buildCorsOriginMatcher(),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  if (swaggerEnabled) {
    const appName = process.env.APP_NAME || 'Vidal Pay Backend';
    const options = new DocumentBuilder()
      .setTitle(appName)
      .setDescription(`API Documentation for ${appName}`)
      .setVersion('1.0')
      .addTag(appName)
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('api-docs', app, document, {
      jsonDocumentUrl: 'api-docs-json',
    });
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');

  logger.log(`Application is running on: ${await app.getUrl()}`);
}

function buildCorsOriginMatcher() {
  const allowedOrigins = [
    ...(process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    process.env.FRONTEND_URL,
    process.env.ADMIN_DASHBOARD_URL,
    process.env.APP_URL,
  ].filter(isRealOrigin);

  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, allowedOrigins.includes(origin));
  };
}

function isRealOrigin(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^https?:\/\//i.test(value) &&
    value.trim().toLowerCase() !== 'value',
  );
}

bootstrap();
