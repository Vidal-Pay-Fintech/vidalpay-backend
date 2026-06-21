import { User } from 'src/database/entities/user.entity';
import { toSafeUser } from './user-response.mapper';

describe('toSafeUser', () => {
  it('removes every credential and recovery field', () => {
    const user = {
      id: 'user-id',
      email: 'user@example.com',
      password: 'password-hash',
      pin: 'pin-hash',
      resetToken: 'reset-token',
      resetTokenExpiry: new Date(),
      signupRegionEvidence: { ipRegion: 'NG' },
    } as unknown as User;

    expect(toSafeUser(user)).toEqual({
      id: 'user-id',
      email: 'user@example.com',
    });
  });
});
