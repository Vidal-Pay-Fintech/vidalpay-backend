import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import jwtConfig from 'src/iam/config/jwt.config';
import { REQUEST_USER_KEY } from 'src/iam/iam.constants';
import {
  AccessTokenPayload,
  JwtTokenType,
} from 'src/iam/interfaces/jwt-token.interface';
import { RefreshSessionRepository } from 'src/database/repositories/refresh-session.repository';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly refreshSessionRepository: RefreshSessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.jwtConfiguration.secret,
          audience: this.jwtConfiguration.audience,
          issuer: this.jwtConfiguration.issuer,
        },
      );
      if (
        payload.tokenType !== JwtTokenType.ACCESS ||
        !payload.sub ||
        !payload.email ||
        !payload.role ||
        !payload.sid ||
        !payload.familyId
      ) {
        throw new UnauthorizedException();
      }
      const active = await this.refreshSessionRepository.isSessionActive(
        payload.sid,
        payload.sub,
      );
      if (!active) throw new UnauthorizedException();
      request[REQUEST_USER_KEY] = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

    return scheme?.toLowerCase() === 'bearer' ? token : undefined;
  }
}
