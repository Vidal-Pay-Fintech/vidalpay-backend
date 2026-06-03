import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { InternalTransferDto } from 'src/wallet/dto/internal-transafer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('Transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post('internal')
  createInternalTransfer(
    @ActiveUser() user: ActiveUserData,
    @Body() internalTransferDto: InternalTransferDto,
  ) {
    return this.transfersService.createInternalTransfer(
      user.sub,
      internalTransferDto,
    );
  }
}
