import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestLogRepository } from 'src/database/repositories/requestLog.repository';
import { JwtPayload, jwtDecode } from 'jwt-decode';
import { APIType } from 'src/common/enum/api-type.dto';

@Injectable()
export class RequestLogsMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLogsMiddleware.name);

  constructor(private readonly requestLogRepository: RequestLogRepository) {}
  async use(req: Request, res: Response, next: NextFunction) {
    if (req.originalUrl.startsWith('/api/v1/auth')) {
      if (req.method === APIType.GET) {
        req.body = {};
      }

      const sanitizedBody = this.sanitizeForLogging(req.body);
      this.requestLogRepository.create({
        requestPath: req.originalUrl,
        requestBody: JSON.stringify(sanitizedBody),
        requestParam: JSON.stringify(req.params),
        requestQuery: JSON.stringify(req.query),
        ipAddress: req?.ip,
        // userId: undefined,
        // device: undefined,
        userAgent: req?.headers['user-agent'] || undefined,
        // role: undefined,
      });
      next();
      return;
    }

    if (!req.originalUrl.startsWith('/api/v1/auth')) {
      const accessToken = req.headers['authorization'];

      if (!accessToken) {
        return next();
      }

      try {
        const requestUserInfo: any = jwtDecode<JwtPayload>(accessToken);

        if (requestUserInfo) {
          this.requestLogRepository.create({
            requestPath: req.originalUrl,
            requestBody: JSON.stringify(this.sanitizeForLogging(req.body)),
            requestParam: JSON.stringify(req.params),
            requestQuery: JSON.stringify(req.query),
            ipAddress: req?.ip,
            userId: requestUserInfo?.sub || null,
            device: requestUserInfo?.device || null,
            userAgent: req?.headers['user-agent'] || undefined,
            role: requestUserInfo?.role || null,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Failed to decode request JWT for ${req.originalUrl}: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`,
        );
      }
    }

    next();
  }

  private sanitizeForLogging(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeForLogging(item));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (this.isSensitiveKey(normalizedKey)) {
          return [key, '*********'];
        }

        return [key, this.sanitizeForLogging(nestedValue)];
      }),
    );
  }

  private isSensitiveKey(key: string): boolean {
    return [
      'password',
      'newpassword',
      'oldpassword',
      'confirmpassword',
      'transactionpassword',
      'pin',
      'newpin',
      'oldpin',
      'confirmpin',
      'transactionpin',
      'token',
      'refreshtoken',
      'accesstoken',
      'otp',
      'secret',
      'apikey',
    ].includes(key);
  }
}
