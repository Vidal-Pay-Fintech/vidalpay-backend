import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestLogRepository } from 'src/database/repositories/requestLog.repository';
import { JwtPayload, jwtDecode } from 'jwt-decode';
import { APIType } from 'src/common/enum/api-type.dto';

@Injectable()
export class RequestLogsMiddleware implements NestMiddleware {
  constructor(private readonly requestLogRepository: RequestLogRepository) {}
  async use(req: Request, res: Response, next: NextFunction) {
    if (req.originalUrl.startsWith('/api/v1/auth')) {
      const excludedKeys = [
        'password',
        'pin',
        'new_password',
        'new_pin',
        'old_password',
        'old_pin',
        'confirm_password',
        'confirm_pin',
        'transaction_pin',
        'transaction_password',
      ];

      if (req.method === APIType.GET) {
        req.body = {};
      }

      const sanitizedBody = Object.fromEntries(
        Object.entries(req.body).map(([key, value]) =>
          excludedKeys.includes(key) ? [key, '*********'] : [key, value],
        ),
      );
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
      console.log(accessToken, 'accessToken');

      if (!accessToken) {
        return next();
      }

      try {
        const requestUserInfo: any = jwtDecode<JwtPayload>(accessToken);

        if (requestUserInfo) {
          this.requestLogRepository.create({
            requestPath: req.originalUrl,
            requestBody: JSON.stringify(req.body),
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
        console.error('Error decoding JWT token:', err);
        // Optionally, you can log the error or handle it as needed
      }
    }

    next();
  }
}
