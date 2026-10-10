import {
  AdminController,
  AdminKycController,
  CardsController,
  FxController,
  KycController,
  MeController,
  NotificationsController,
  ProvidersController,
  ReferralsController,
  RewardsController,
  TransfersController,
  WebhooksController,
} from './vidalpay.controller';
import { VidalpayService } from './vidalpay.service';
import { AUTH_TYPE_KEY } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';
import { ROLES_KEY } from 'src/iam/decorators/roles.decorator';
import { RolesGuard } from 'src/iam/guards/roles.guard';
import { Role } from 'src/common/enum/role.enum';

describe('VidalPay mobile contract controllers', () => {
  const service = {
    getProviderStatuses: jest.fn(),
    probeFincraSandbox: jest.fn(),
    listAdminUsers: jest.fn(),
    getAdminUser: jest.fn(),
    getAdminFinanceOverview: jest.fn(),
    listAdminMoneyEvents: jest.fn(),
    getAdminMoneyEvent: jest.fn(),
    listAdminProviderOperations: jest.fn(),
    getAdminProviderOperation: jest.fn(),
    listAdminSupportTickets: jest.fn(),
    getAdminSupportTicket: jest.fn(),
    listAdminWhatsAppConversations: jest.fn(),
    listAdminVtuOperations: jest.fn(),
    getProductCapabilities: jest.fn(),
    startKyc: jest.fn(),
    getKycStatus: jest.fn(),
    requestKycInformation: jest.fn(),
    internalTransfer: jest.fn(),
    listCards: jest.fn(),
    createCard: jest.fn(),
    blockCardOperation: jest.fn(),
    listNotifications: jest.fn(),
    markNotificationsRead: jest.fn(),
    handleProviderWebhook: jest.fn(),
    handleFincraWebhook: jest.fn(),
    handleKycWebhook: jest.fn(),
    getFxRates: jest.fn(),
    getFxQuote: jest.fn(),
    rewardsDashboard: jest.fn(),
    rewardsHistory: jest.fn(),
    redeemRewards: jest.fn(),
    referralsDashboard: jest.fn(),
    referralEarnings: jest.fn(),
    trackReferralInvite: jest.fn(),
  } as unknown as jest.Mocked<Partial<VidalpayService>>;
  const user = { sub: 'user-1' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('exposes provider readiness for mobile feature gating', async () => {
    (service.getProviderStatuses as jest.Mock).mockReturnValue({
      providers: [],
    });

    expect(
      new ProvidersController(service as VidalpayService).status(),
    ).toEqual({ providers: [] });
  });

  it('routes the admin Fincra sandbox probe through a backend-only service', () => {
    (service.probeFincraSandbox as jest.Mock).mockResolvedValue({
      provider: 'FINCRA',
      environment: 'SANDBOX',
    });

    new ProvidersController(service as VidalpayService).fincraSandboxProbe();

    expect(service.probeFincraSandbox).toHaveBeenCalled();
  });

  it('protects the Fincra sandbox probe with Bearer auth and admin roles metadata', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      ProvidersController.prototype,
      'fincraSandboxProbe',
    );

    expect(Reflect.getMetadata(AUTH_TYPE_KEY, descriptor?.value)).toEqual([
      AuthType.Bearer,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, descriptor?.value)).toEqual([
      Role.ADMIN,
      Role.SUPER_ADMIN,
    ]);
  });

  it('rejects unauthenticated and ordinary users through the real roles guard', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([Role.ADMIN, Role.SUPER_ADMIN]),
    };
    const authService = {
      verifyToken: jest.fn(async (token: string) =>
        token === 'admin-token'
          ? { role: Role.ADMIN }
          : token === 'user-token'
            ? { role: Role.REGULAR }
            : null,
      ),
    };
    const guard = new RolesGuard(reflector as any, authService as any);
    const context = (authorization?: string) =>
      ({
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization } }),
        }),
      }) as any;

    await expect(guard.canActivate(context(''))).resolves.toBe(false);
    await expect(guard.canActivate(context('Bearer user-token'))).resolves.toBe(
      false,
    );
    await expect(
      guard.canActivate(context('Bearer admin-token')),
    ).resolves.toBe(true);
  });

  it('routes admin dashboard users and finance views to real backend readers', () => {
    const controller = new AdminController(service as VidalpayService);
    const query = { page: '1', limit: '50' } as any;

    controller.users(query);
    controller.user('user-1');
    controller.financeOverview();
    controller.moneyEvents(query);
    controller.moneyEvent('txn-1');
    controller.ledgerEntries(query);
    controller.ledgerEntry('txn-2');
    controller.providerOperations(query);
    controller.providerOperation('op-1');
    controller.supportTickets(query);
    controller.supportTicket('ticket-1');
    controller.whatsappConversations(query);
    controller.vtuOperations(query);

    expect(service.listAdminUsers).toHaveBeenCalledWith(query);
    expect(service.getAdminUser).toHaveBeenCalledWith('user-1');
    expect(service.getAdminFinanceOverview).toHaveBeenCalled();
    expect(service.listAdminMoneyEvents).toHaveBeenCalledTimes(2);
    expect(service.getAdminMoneyEvent).toHaveBeenCalledWith('txn-1');
    expect(service.getAdminMoneyEvent).toHaveBeenCalledWith('txn-2');
    expect(service.listAdminProviderOperations).toHaveBeenCalledWith(query);
    expect(service.getAdminProviderOperation).toHaveBeenCalledWith('op-1');
    expect(service.listAdminSupportTickets).toHaveBeenCalledWith(query);
    expect(service.getAdminSupportTicket).toHaveBeenCalledWith('ticket-1');
    expect(service.listAdminWhatsAppConversations).toHaveBeenCalledWith(query);
    expect(service.listAdminVtuOperations).toHaveBeenCalledWith(query);
  });

  it('protects admin dashboard readers with Bearer auth and admin roles metadata', () => {
    expect(Reflect.getMetadata(AUTH_TYPE_KEY, AdminController)).toEqual([
      AuthType.Bearer,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([
      Role.ADMIN,
      Role.SUPER_ADMIN,
    ]);
  });

  it('exposes account product capabilities for mobile feature gating', () => {
    (service.getProductCapabilities as jest.Mock).mockReturnValue({
      products: {},
    });

    expect(
      new MeController(service as VidalpayService).capabilities(user),
    ).toEqual({ products: {} });
    expect(service.getProductCapabilities).toHaveBeenCalledWith('user-1');
  });

  it('routes KYC start/status through the backend KYC source of truth', () => {
    const controller = new KycController(service as VidalpayService);

    controller.start(user);
    controller.status(user);

    expect(service.startKyc).toHaveBeenCalledWith('user-1');
    expect(service.getKycStatus).toHaveBeenCalledWith('user-1');
  });

  it('routes admin KYC more-info requests through the action-required service contract', () => {
    const controller = new AdminKycController(service as VidalpayService);
    const admin = { sub: 'admin-1' } as any;
    const body = {
      reason: 'Proof of address is unclear',
      missingRequirements: ['proof_of_address'],
    };

    controller.requestMoreInfo(admin, 'user-1', body);
    controller.requestInformation(admin, 'user-2', body);

    expect(service.requestKycInformation).toHaveBeenCalledWith(
      'admin-1',
      'user-1',
      body,
    );
    expect(service.requestKycInformation).toHaveBeenCalledWith(
      'admin-1',
      'user-2',
      body,
    );
  });

  it('routes internal transfers with active-user context for backend PIN/idempotency checks', () => {
    const body = {
      amount: 10,
      currency: 'USD',
      pin: '1234',
      idempotencyKey: 'idem-1',
    };

    new TransfersController(service as VidalpayService).internal(user, body);

    expect(service.internalTransfer).toHaveBeenCalledWith('user-1', body);
  });

  it('routes read-only FX rates and quotes through backend services', () => {
    const controller = new FxController(service as VidalpayService);
    const user = { sub: 'user-1' } as any;

    controller.rates(user);
    controller.quotes(user, { fromCurrency: 'NGN', toCurrency: 'USD' });

    expect(service.getFxRates).toHaveBeenCalledWith('user-1');
    expect(service.getFxQuote).toHaveBeenCalledWith('user-1', {
      fromCurrency: 'NGN',
      toCurrency: 'USD',
    });
  });

  it('routes card creation and lifecycle actions through provider-aware service methods', () => {
    const controller = new CardsController(service as VidalpayService);

    controller.virtual(user, { currency: 'USD' });
    controller.freeze(user, 'card-1');

    expect(service.createCard).toHaveBeenCalledWith('user-1', 'virtual', {
      currency: 'USD',
    });
    expect(service.blockCardOperation).toHaveBeenCalledWith(
      'user-1',
      'card-1',
      'freeze',
    );
  });

  it('routes notification reads with optional selected notification ids', () => {
    const controller = new NotificationsController(service as VidalpayService);

    controller.read(user, { notificationIds: ['n-1'] });

    expect(service.markNotificationsRead).toHaveBeenCalledWith('user-1', [
      'n-1',
    ]);
  });

  it('routes rewards endpoints through ledger-aware service methods', () => {
    const controller = new RewardsController(service as VidalpayService);
    const body = { points: 100, idempotencyKey: 'redeem-1' };

    controller.dashboard(user);
    controller.history(user);
    controller.redeem(user, body);

    expect(service.rewardsDashboard).toHaveBeenCalledWith('user-1');
    expect(service.rewardsHistory).toHaveBeenCalledWith('user-1');
    expect(service.redeemRewards).toHaveBeenCalledWith('user-1', body);
  });

  it('routes referral dashboard, earnings, and invite tracking separately', () => {
    const controller = new ReferralsController(service as VidalpayService);
    const body = { email: 'friend@example.com', idempotencyKey: 'invite-1' };

    controller.dashboard(user);
    controller.earnings(user);
    controller.invite(user, body);

    expect(service.referralsDashboard).toHaveBeenCalledWith('user-1');
    expect(service.referralEarnings).toHaveBeenCalledWith('user-1');
    expect(service.trackReferralInvite).toHaveBeenCalledWith('user-1', body);
  });

  it('keeps provider webhooks unauthenticated and provider-scoped', () => {
    const controller = new WebhooksController(service as VidalpayService);

    controller.unit({ reference: 'unit-ref' });
    controller.fincra(
      { reference: 'fincra-ref' },
      'fincra-signature',
      undefined,
    );
    controller.payvessel({ reference: 'payvessel-ref' });

    expect(service.handleProviderWebhook).toHaveBeenCalledWith(
      'Unit.co',
      { reference: 'unit-ref' },
      undefined,
    );
    expect(service.handleFincraWebhook).toHaveBeenCalledWith(
      { reference: 'fincra-ref' },
      'fincra-signature',
    );
    expect(service.handleProviderWebhook).toHaveBeenCalledWith(
      'PayVessel',
      { reference: 'payvessel-ref' },
      undefined,
    );
  });

  it('passes the MetaMap signature to the KYC webhook handler', () => {
    const controller = new WebhooksController(service as VidalpayService);

    controller.kyc(
      { eventId: 'event-1', status: 'VERIFIED' },
      'sha256=signature',
      undefined,
      undefined,
    );

    expect(service.handleKycWebhook).toHaveBeenCalledWith(
      { eventId: 'event-1', status: 'VERIFIED' },
      'sha256=signature',
    );
  });

  it('routes Zendesk, WhatsApp, and VTU webhooks without auth metadata', () => {
    const controller = new WebhooksController(service as VidalpayService);
    (service as any).verifyWhatsAppWebhook = jest.fn();
    (service as any).handleWhatsAppWebhook = jest.fn();
    (service as any).handleZendeskWebhook = jest.fn();
    (service as any).handleVtuWebhook = jest.fn();

    controller.whatsappVerify({ 'hub.challenge': 'challenge' });
    controller.whatsapp({ entry: [] }, 'sha256=wa', undefined);
    controller.zendesk({ ticket_id: '1' }, 'sha256=zd', undefined);
    controller.vtu({ reference: 'vtu-1' }, 'sha256=vtu', undefined);

    expect((service as any).verifyWhatsAppWebhook).toHaveBeenCalledWith({
      'hub.challenge': 'challenge',
    });
    expect((service as any).handleWhatsAppWebhook).toHaveBeenCalledWith(
      { entry: [] },
      'sha256=wa',
    );
    expect((service as any).handleZendeskWebhook).toHaveBeenCalledWith(
      { ticket_id: '1' },
      'sha256=zd',
    );
    expect((service as any).handleVtuWebhook).toHaveBeenCalledWith(
      { reference: 'vtu-1' },
      'sha256=vtu',
    );
  });
});
