import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
  } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { map } from 'rxjs/operators';
  import { SuccessResponseDto } from '../dtos/success.dto';
  
  @Injectable()
  export class ResponseInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
      return next
        .handle()
        .pipe(map((res: unknown) => this.responseHandler(res, context)));
    }
  
    responseHandler(res: any, context: ExecutionContext): SuccessResponseDto {
      const ctx = context.switchToHttp();
      const response = ctx.getResponse();
      const statusCode = response.statusCode;
  
      //CHECK IF INSTANCE OF res is a string,
      //IF true, return the string as the message
      let message = 'success';
      let apiData = res;
      if (typeof res === 'string') {
        message = res;
        apiData = null;
      }
  
      return {
        status: true,
        code: statusCode,
        message: message,
        data: apiData,
      };
    }
  }