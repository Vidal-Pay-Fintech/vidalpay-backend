import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'src/common/enum/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { REQUEST_USER_KEY } from '../iam.constants';
import { AccessTokenPayload } from '../interfaces/jwt-token.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // No roles required, so access is granted
    }

    const request = context.switchToHttp().getRequest();
    const activeUser = request[REQUEST_USER_KEY] as
      | AccessTokenPayload
      | undefined;
    if (!activeUser) {
      return false;
    }

    return requiredRoles.some((role) => role === (activeUser.role as string));
  }
}
