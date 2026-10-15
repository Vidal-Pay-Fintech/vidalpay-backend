import { fincraIdentityFingerprint, matchesFincraIdentity } from './fincra-identity';

describe('Fincra identity matching', () => {
  const user = { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-02' };
  it('matches the documented provider date and normalized name casing', () => {
    expect(matchesFincraIdentity(user, { firstName: ' JANE ', lastName: 'DOE', dateOfBirth: '02-Jan-1990' })).toBe(true);
  });
  it.each([
    {}, { ...user, lastName: 'Someone' }, { ...user, dateOfBirth: '1990-02-01' },
    { ...user, dateOfBirth: '01/02/1990' }, { ...user, dateOfBirth: '31-Feb-1990' },
    { ...user, dateOfBirth: '02-Unknown-1990' },
  ])('rejects missing or mismatched identity evidence', (resolved) => {
    expect(matchesFincraIdentity(user, resolved)).toBe(false);
  });
  it('changes evidence fingerprint when the customer identity changes', () => {
    expect(fincraIdentityFingerprint(user)).not.toEqual(fincraIdentityFingerprint({ ...user, lastName: 'Changed' }));
  });
});
