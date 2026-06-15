import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { InternalTransferDto } from 'src/wallet/dto/internal-transafer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('Transfers')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post('internal')
  @ApiOperation({
    summary: 'Create an internal Vidal Tag-to-Tag transfer',
    description:
      'Transfers funds between Vidal Pay users by recipient tag. This route uses internal transfer product rules and does not require KYC when tag transfers are enabled without KYC.',
  })
  @ApiBody({ type: InternalTransferDto })
  @ApiResponse({
    status: 201,
    description: 'Internal tag transfer completed successfully.',
  })
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
