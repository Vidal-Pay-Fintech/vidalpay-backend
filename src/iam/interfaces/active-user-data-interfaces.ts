import { UserRole } from 'src/utils/enums/user.enum';

export interface ActiveUserData {
  /**
   * The 'subject' of the token. The value of this property is the user ID
   * that granted this token
   */
  sub: string;

  /**
   * The subject's (user) email
   */
  email: string;

  phone: string;

  role: UserRole;
}
