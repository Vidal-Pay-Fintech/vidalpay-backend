import { UserRole } from 'src/utils/enums/user.enum';
import { JwtTokenType } from './jwt-token.interface';

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

  phone?: string;

  role: UserRole;

  tokenType: JwtTokenType.ACCESS;

  sid: string;

  familyId: string;
}
