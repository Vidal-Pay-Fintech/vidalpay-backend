import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProviderWebhookEventStatus } from 'src/common/enum/provider-operation.enum';
import { Role } from 'src/common/enum/role.enum';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { Roles } from 'src/iam/decorators/roles.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { AdminProviderOperationsService } from './admin-provider-operations.service';

type AdminRequest = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

@ApiTags('Admin Provider Operations')
@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
@Controller('admin')
export class AdminProviderOperationsController {
  constructor(
    private readonly adminProviderOperationsService: AdminProviderOperationsService,
  ) {}

  @Get('provider-operations')
  listProviderOperations(
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.adminProviderOperationsService.listProviderOperations({
      status,
      provider,
      take,
      skip,
    });
  }

  @Get('provider-operations/:id')
  getProviderOperation(@Param('id') id: string) {
    return this.adminProviderOperationsService.getProviderOperation(id);
  }

  @Post('provider-operations/:id/retry')
  requestProviderOperationRetry(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: AdminRequest,
  ) {
    return this.adminProviderOperationsService.requestRetry(
      id,
      this.buildAdminContext(actor, request, reason),
    );
  }

  @Post('provider-operations/:id/reverse')
  requestProviderOperationReversal(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: AdminRequest,
  ) {
    return this.adminProviderOperationsService.requestReversal(
      id,
      this.buildAdminContext(actor, request, reason),
    );
  }

  @Post('provider-operations/:id/mark-reviewed')
  markProviderOperationReviewed(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: AdminRequest,
  ) {
    return this.adminProviderOperationsService.markReviewed(
      id,
      this.buildAdminContext(actor, request, reason),
    );
  }

  @Get('webhook-events')
  listWebhookEvents(
    @Query('status') status?: ProviderWebhookEventStatus,
    @Query('provider') provider?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.adminProviderOperationsService.listWebhookEvents({
      status,
      provider,
      take,
      skip,
    });
  }

  @Get('webhook-events/:id')
  getWebhookEvent(@Param('id') id: string) {
    return this.adminProviderOperationsService.getWebhookEvent(id);
  }

  @Post('webhook-events/:id/replay')
  requestWebhookReplay(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: AdminRequest,
  ) {
    return this.adminProviderOperationsService.requestWebhookReplay(
      id,
      this.buildAdminContext(actor, request, reason),
    );
  }

  @Get('reconciliation/summary')
  getReconciliationSummary() {
    return this.adminProviderOperationsService.getReconciliationSummary();
  }

  @Post('reconciliation/run')
  runReconciliation(
    @Body('reason') reason: string | undefined,
    @ActiveUser() actor: ActiveUserData,
    @Req() request: AdminRequest,
  ) {
    return this.adminProviderOperationsService.runReconciliation(
      this.buildAdminContext(actor, request, reason),
    );
  }

  private buildAdminContext(
    actor: ActiveUserData,
    request: AdminRequest,
    reason?: string,
  ) {
    return {
      actorId: actor?.sub ?? null,
      actorRole: actor?.role ?? null,
      reason: reason ?? null,
      ipAddress: request?.ip ?? null,
      userAgent: this.getHeader(request, 'user-agent'),
    };
  }

  private getHeader(request: AdminRequest, header: string) {
    const value = request?.headers?.[header];
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }
}
