import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Role } from 'src/common/enum/role.enum';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { Roles } from 'src/iam/decorators/roles.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import {
  AdminKycDecisionDto,
  AdminReasonDto,
  AdminRoleChangeDto,
  AdminUserListQueryDto,
} from './dto/admin-user-management.dto';
import { AdminUserManagementService } from './admin-user-management.service';

@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.CUSTOMER_SUPPORT)
@Controller('admin')
export class AdminUserManagementController {
  constructor(private readonly service: AdminUserManagementService) {}

  @Get('users')
  listUsers(@Query() query: AdminUserListQueryDto) {
    return this.service.listUsers(query);
  }

  @Get('kyc/reviews')
  listKycReviews(@Query() query: AdminUserListQueryDto) {
    return this.service.listKycQueue(query);
  }

  @Get('users/:id')
  getUser(@Param('id') userId: string) {
    return this.service.getUser(userId);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('users/:id/suspend')
  suspend(
    @Param('id') userId: string,
    @Body() dto: AdminReasonDto,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: Request,
  ) {
    return this.service.suspend(
      userId,
      dto.reason,
      this.context(actor, request),
    );
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('users/:id/reactivate')
  reactivate(
    @Param('id') userId: string,
    @Body() dto: AdminReasonDto,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: Request,
  ) {
    return this.service.reactivate(
      userId,
      dto.reason,
      this.context(actor, request),
    );
  }

  @Roles(Role.SUPER_ADMIN)
  @Post('users/:id/role')
  changeRole(
    @Param('id') userId: string,
    @Body() dto: AdminRoleChangeDto,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: Request,
  ) {
    return this.service.changeRole(userId, dto, this.context(actor, request));
  }

  @Post('kyc/:userId/review')
  reviewKyc(
    @Param('userId') userId: string,
    @Body() dto: AdminKycDecisionDto,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: Request,
  ) {
    return this.service.reviewKyc(userId, dto, this.context(actor, request));
  }

  private context(actor: ActiveUserData, request: Request) {
    return {
      actorId: actor.sub,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };
  }
}
