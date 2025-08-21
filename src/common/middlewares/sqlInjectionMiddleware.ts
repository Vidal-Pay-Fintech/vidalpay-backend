// sql-injection.middleware.ts
import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SqlInjectionMiddleware implements NestMiddleware {
  private sqlKeywords = [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'UNION',
    // 'OR',
    // 'AND',
    // 'WHERE',
    // 'FROM',
    '--',
    ';',
    '/*',
    '*/',
    'xp_',
    'EXEC',
  ];

  use(req: Request, res: Response, next: NextFunction) {
    const { body, query, params } = req;

    if (
      this.checkForSqlInjection(body) ||
      this.checkForSqlInjection(query) ||
      this.checkForSqlInjection(params)
    ) {
      throw new BadRequestException('Potential SQL injection detected');
    }

    next();
  }

  private checkForSqlInjection(obj: any): boolean {
    if (!obj) return false;

    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        const value = obj[key].toUpperCase();
        if (this.sqlKeywords.some((keyword) => value.includes(keyword))) {
          return true;
        }
      }
    }
    return false;
  }
}

// // app.module.ts
// export class AppModule implements NestModule {
//   configure(consumer: MiddlewareConsumer) {
//     consumer.apply(SqlInjectionMiddleware).forRoutes('*'); // Apply to all routes
//   }
// }
