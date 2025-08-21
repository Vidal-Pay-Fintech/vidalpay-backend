import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { UTILITIES } from 'src/utils/helperFuncs';

@Injectable()
export class ErrorHandlingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestDetails = {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      query: req.query,
      params: req.params,
    };

    res.on('finish', async () => {
      const statusCode = res.statusCode;
      const errorDetails = res?.locals?.error || 'No additional error details';

      if (statusCode >= 500) {
        try {
          await UTILITIES.postToSlack(
            `${statusCode} - Request Details: ${JSON.stringify(requestDetails)}, Error Details: ${JSON.stringify(res)}`,
          );
        } catch (slackError) {
          console.error('Failed to post to Slack:', slackError);
        }

        // Optional: Customize the response if not already handled
        if (!res.headersSent) {
          res.status(statusCode).json({
            statusCode,
            message: 'Internal Server Error. Please try again later.',
            errorDetails,
          });
        }
      }
    });
    next();
  }
}
