import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { ProviderOperationsService } from './provider-operations.service';

@ApiTags('Provider Webhooks')
@Auth(AuthType.None)
@Controller('integrations/webhooks')
export class ProviderWebhookController {
  constructor(
    private readonly providerOperationsService: ProviderOperationsService,
  ) {}

  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  handleFlutterwaveWebhook(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.providerOperationsService.handleWebhook({
      provider: KycProvider.FLUTTERWAVE,
      payload,
      headers,
    });
  }

  @Post('lead-bank')
  @HttpCode(HttpStatus.OK)
  handleLeadBankWebhook(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.providerOperationsService.handleWebhook({
      provider: KycProvider.LEAD_BANK,
      payload,
      headers,
    });
  }
}
