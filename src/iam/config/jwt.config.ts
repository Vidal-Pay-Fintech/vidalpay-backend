import { registerAs } from '@nestjs/config';
import { parseTokenTtl } from './token-ttl';

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET;

  return {
    secret,
    refreshSecret: process.env.JWT_REFRESH_SECRET || secret,
    audience: process.env.JWT_TOKEN_AUDIENCE,
    issuer: process.env.JWT_TOKEN_ISSUER,
    accessTokenTtl: parseTokenTtl(
      process.env.JWT_ACCESS_TOKEN_TTL ??
        process.env.JWT_ACCESS_TOKEN_TtL ??
        '3600s',
      'JWT_ACCESS_TOKEN_TTL',
    ),
    refreshTokenTtl: parseTokenTtl(
      process.env.JWT_REFRESH_TOKEN_TTL ??
        process.env.JWT_REFRESH_ACCESS_TOKEN_TTL ??
        '7d',
      'JWT_REFRESH_TOKEN_TTL',
    ),
  };
});
