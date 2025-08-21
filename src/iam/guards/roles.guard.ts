import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'src/common/enum/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticationService } from '../authentication/authentication.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authService: AuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // No roles required, so access is granted
    }

    const request = context.switchToHttp().getRequest();
    const [type, token] = request?.headers?.authorization?.split(' ');
    if (!token) {
      return false;
    }
    const decodedToken = await this.authService.verifyToken(token);
    console.log(decodedToken, 'THE DECODED TOKEN');
    if (!decodedToken) {
      return false;
    }

    if (requiredRoles.includes(decodedToken.role)) {
      return true;
    }
    // if (decodedToken.role === requiredRoles[0]) {
    //   return true;
    // }
    return false;
  }
}
