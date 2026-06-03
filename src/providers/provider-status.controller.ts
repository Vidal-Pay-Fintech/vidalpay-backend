import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';
import { ProviderStatusService } from './provider-status.service';

@ApiTags('Providers')
@Auth(AuthType.None)
@Controller('providers')
export class ProviderStatusController {
  constructor(private readonly providerStatusService: ProviderStatusService) {}

  @Get('status')
  getProviderStatuses() {
    return this.providerStatusService.getProviderStatuses();
  }
}
