import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { FxConvertDto } from './dto/fx-convert.dto';
import { FxQuoteDto } from './dto/fx-quote.dto';
import { FxService } from './fx.service';
import { DemoOnly } from 'src/feature-flags/demo-only.decorator';

@ApiTags('FX')
@Controller('fx')
@DemoOnly('ENABLE_FX_CONVERSION_DEMO')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Post('quote')
  createQuote(@Body() fxQuoteDto: FxQuoteDto) {
    return this.fxService.createQuote(fxQuoteDto);
  }

  @Post('convert')
  convert(
    @ActiveUser() user: ActiveUserData,
    @Body() fxConvertDto: FxConvertDto,
  ) {
    return this.fxService.convert(user.sub, fxConvertDto);
  }
}
