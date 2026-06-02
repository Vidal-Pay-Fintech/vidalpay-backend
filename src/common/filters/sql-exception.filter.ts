// sql-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Catch(QueryFailedError)
export class SqlExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SqlExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    // Log the full error internally
    this.logger.error('Database error', exception.stack);

    // Send a generic error message to the client
    response.status(500).json({
      statusCode: 500,
      message: 'A database error occurred',
    });
  }
}
