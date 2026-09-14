import {
  CardsController,
  KycController,
  NotificationsController,
  ProvidersController,
  ReferralsController,
  RewardsController,
  TransfersController,
  WebhooksController,
} from './vidalpay.controller';
import { VidalpayService } from './vidalpay.service';

describe('VidalPay mobile contract controllers', () => {
  const service = {
    getProviderStatuses: jest.fn(),
    startKyc: jest.fn(),
    getKycStatus: jest.fn(),
    internalTransfer: jest.fn(),
    listCards: jest.fn(),
    createCard: jest.fn(),
    blockCardOperation: jest.fn(),
    listNotifications: jest.fn(),
    markNotificationsRead: jest.fn(),
    handleProviderWebhook: jest.fn(),
    handleKycWebhook: jest.fn(),
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

  it('routes KYC start/status through the backend KYC source of truth', () => {
    const controller = new KycController(service as VidalpayService);

    controller.start(user);
    controller.status(user);

    expect(service.startKyc).toHaveBeenCalledWith('user-1');
    expect(service.getKycStatus).toHaveBeenCalledWith('user-1');
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
    controller.payvessel({ reference: 'payvessel-ref' });

    expect(service.handleProviderWebhook).toHaveBeenCalledWith(
      'Unit.co',
      { reference: 'unit-ref' },
      undefined,
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
});
