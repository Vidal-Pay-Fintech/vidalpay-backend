import { User } from 'src/database/entities/user.entity';

export type SafeUser = Omit<
  User,
  | 'password'
  | 'pin'
  | 'resetToken'
  | 'resetTokenExpiry'
  | 'signupRegionEvidence'
>;

export function toSafeUser(user: User): SafeUser {
  const {
    password: _password,
    pin: _pin,
    resetToken: _resetToken,
    resetTokenExpiry: _resetTokenExpiry,
    signupRegionEvidence: _signupRegionEvidence,
    ...safeUser
  } = user;

  return safeUser as SafeUser;
}
