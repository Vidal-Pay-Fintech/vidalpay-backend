import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { Observable } from 'rxjs';
import * as winston from 'winston';

export const loggerConfig = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, context, trace }) => {
            return `${timestamp} [${context}] ${level}: ${message}${trace ? `\n${trace}` : ''}`;
          },
        ),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
});
// Security event logging interceptor
@Injectable()
export class SecurityLoggingInterceptor implements NestInterceptor {
  constructor(private logger: winston.Logger) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip, headers } = request;

    // Log suspicious activity
    if (this.isSuspiciousRequest(request)) {
      this.logger.warn('Suspicious request detected', {
        method,
        url,
        ip,
        userAgent: headers['user-agent'],
        timestamp: new Date().toISOString(),
      });
    }

    return next.handle();
  }
  private isSuspiciousRequest(request: any): boolean {
    // Add your suspicious activity detection logic here
    const suspiciousPatterns = [
      /\.\./, // Directory traversal
      /<script/i, // XSS attempts
      /union.*select/i, // SQL injection
    ];

    const urlAndBody = `${request.url} ${JSON.stringify(request.body)}`;
    return suspiciousPatterns.some((pattern) => pattern.test(urlAndBody));
  }
}
