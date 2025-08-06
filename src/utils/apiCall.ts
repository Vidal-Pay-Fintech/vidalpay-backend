import axios, { AxiosResponse } from 'axios';
import { BadRequestException, Logger } from '@nestjs/common';
import { API_MESSAGES } from './apiMessages';
import { APIType } from 'src/common/enum/api-type.dto';

class ApiCall {
  private logger: Logger;
  constructor() {
    this.logger = new Logger(ApiCall.name);
  }

  async sendRequest(
    url: string,
    method: APIType,
    headers: Record<string, string> = {},
    body: Record<string, any> = {},
    query: Record<string, any> = {},
  ): Promise<any> {
    try {
      // Default headers
      headers['Accept'] = 'application/json';
      headers['Content-Type'] = 'application/json';

      // Configuring the request options
      const options = {
        headers: headers,
        params: query,
        data: body,
        httpErrors: false,
        responseType: 'text' as const,
      };

      // Sending the request
      const response: AxiosResponse<string> = await axios.request({
        url: url,
        method: method,
        ...options,
      });
      //RETURN THE BODY AS JSON
      // console.log(response, 'THE RESPONSE DATA');
      return response.data;
      // return JSON.parse(response.data);
    } catch (error: any) {
      this.logger.log('ApiCall Failed ()');
      console.log(error, 'THE ERROR BACK');

      let errMsg: any;

      try {
        errMsg = JSON.parse(error?.response?.data);
        const message =
          errMsg?.message ||
          errMsg?.error_description ||
          errMsg?.error_message ||
          errMsg?.error;

        if (message) {
          throw new BadRequestException(message);
        }
      } catch (parsingError) {
        console.log(parsingError, 'THE ERROR PARSEDD');
        const errMessage = parsingError?.response?.message;
        throw new BadRequestException(errMessage || API_MESSAGES.SERVER_ERROR);
      }

      throw new Error('An unknown error occurred');
    }
  }
}

export const APICall = new ApiCall();
