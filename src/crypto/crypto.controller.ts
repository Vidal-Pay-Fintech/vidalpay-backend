import { Controller, Get } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { CryptoService } from './crypto.service';

@Controller('crypto')
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Get('overview')
  getOverview(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.getOverview(user.sub);
  }

  @Get('assets')
  getAssets() {
    return this.cryptoService.getAssets();
  }
}
