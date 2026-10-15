export type FincraEnvironment = 'sandbox' | 'live';

const FINCRA_HOSTS: Record<FincraEnvironment, string> = {
  sandbox: 'https://sandboxapi.fincra.com',
  live: 'https://api.fincra.com',
};

export class FincraConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FincraConfigurationError';
  }
}

// Keep this resolver secret-free so diagnostics and the HTTP client agree.
export function resolveFincraConfiguration(
  get: (key: string) => string | undefined,
) {
  const mode = get('FINCRA_ENV')?.trim().toLowerCase() || 'sandbox';
  if (mode !== 'sandbox' && mode !== 'live') {
    throw new FincraConfigurationError('FINCRA_ENV must be sandbox or live.');
  }
  const baseUrl = FINCRA_HOSTS[mode];
  const configured = get('FINCRA_BASE_URL')?.trim();
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new FincraConfigurationError('FINCRA_BASE_URL must be a valid HTTPS origin.');
    }
    if (
      url.origin !== baseUrl || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash ||
      configured.includes('?') || configured.includes('#') || configured.includes('\\')
    ) {
      throw new FincraConfigurationError(
        `FINCRA_BASE_URL must be ${baseUrl} for FINCRA_ENV=${mode}, without credentials, a path, query, or fragment.`,
      );
    }
  }
  return { environment: mode, baseUrl };
}
