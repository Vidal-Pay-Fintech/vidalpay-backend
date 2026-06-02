export enum ProviderConnectionStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  SANDBOX = 'SANDBOX',
  COMING_SOON = 'COMING_SOON',
  DISABLED = 'DISABLED',
}

export interface ProviderStatusView {
  provider: string;
  status: ProviderConnectionStatus;
  mode: string;
  enabled: boolean;
}
