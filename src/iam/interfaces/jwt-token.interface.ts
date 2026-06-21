import { UserRole } from 'src/utils/enums/user.enum';

export enum JwtTokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  tokenType: JwtTokenType.ACCESS;
  sid: string;
  familyId: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  familyId: string;
  tokenType: JwtTokenType.REFRESH;
  iat?: number;
  exp?: number;
}
