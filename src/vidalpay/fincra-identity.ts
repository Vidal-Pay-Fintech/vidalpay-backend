import { createHash } from 'crypto';

type Identity = { firstName?: unknown; lastName?: unknown; dateOfBirth?: unknown };

const name = (value: unknown) => typeof value === 'string'
  ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase() : '';

function date(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  if (typeof value !== 'string') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  const provider = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const normalized = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : provider
    ? `${provider[3]}-${String(months.indexOf(provider[2].toLowerCase()) + 1).padStart(2, '0')}-${provider[1].padStart(2, '0')}` : null;
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized ? normalized : null;
}

export function fincraIdentityFingerprint(identity: Identity) {
  return createHash('sha256').update(JSON.stringify([
    name(identity.firstName), name(identity.lastName), date(identity.dateOfBirth),
  ])).digest('hex');
}

export function matchesFincraIdentity(user: Identity, resolved: Identity) {
  return Boolean(name(user.firstName) && name(user.lastName) && date(user.dateOfBirth) &&
    name(user.firstName) === name(resolved.firstName) &&
    name(user.lastName) === name(resolved.lastName) &&
    date(user.dateOfBirth) === date(resolved.dateOfBirth));
}
