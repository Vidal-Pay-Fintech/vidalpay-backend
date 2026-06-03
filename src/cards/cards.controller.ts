import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { CardsService } from './cards.service';
import { FundCardDto } from './dto/fund-card.dto';

@ApiTags('Cards')
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  getCards(@ActiveUser() user: ActiveUserData) {
    return this.cardsService.getCards(user.sub);
  }

  @Post('ngn/fund')
  fundNgnCard(
    @ActiveUser() user: ActiveUserData,
    @Body() fundCardDto: FundCardDto,
  ) {
    return this.cardsService.fundNgn(user.sub, fundCardDto);
  }

  @Post('usd/fund')
  fundUsdCard(
    @ActiveUser() user: ActiveUserData,
    @Body() fundCardDto: FundCardDto,
  ) {
    return this.cardsService.fundUsd(user.sub, fundCardDto);
  }

  @Post('ngn/fund-from-usd')
  fundNgnCardFromUsd(
    @ActiveUser() user: ActiveUserData,
    @Body() fundCardDto: FundCardDto,
  ) {
    return this.cardsService.fundNgnFromUsd(user.sub, fundCardDto);
  }

  @Post('usd/fund-from-ngn')
  fundUsdCardFromNgn(
    @ActiveUser() user: ActiveUserData,
    @Body() fundCardDto: FundCardDto,
  ) {
    return this.cardsService.fundUsdFromNgn(user.sub, fundCardDto);
  }
}
