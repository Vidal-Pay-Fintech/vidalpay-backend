import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@Auth(AuthType.None)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  flutterwave(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooksService.handle('flutterwave', payload, headers);
  }

  @Post('smileid')
  @HttpCode(HttpStatus.OK)
  smileId(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooksService.handle('smileid', payload, headers);
  }

  @Post('leadbank')
  @HttpCode(HttpStatus.OK)
  leadBank(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooksService.handle('leadbank', payload, headers);
  }

  @Post('verto')
  @HttpCode(HttpStatus.OK)
  verto(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooksService.handle('verto', payload, headers);
  }

  @Post('zerohash')
  @HttpCode(HttpStatus.OK)
  zeroHash(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooksService.handle('zerohash', payload, headers);
  }

  @Post('cowrywise')
  @HttpCode(HttpStatus.OK)
  cowrywise(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooksService.handle('cowrywise', payload, headers);
  }

  @Post('sardine')
  @HttpCode(HttpStatus.OK)
  sardine(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.webhooksService.handle('sardine', payload, headers);
  }
}
