import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionEnum } from 'src/utils/enums/permission.enum';
// import { RoleRepository } from 'src/database/repositories/role.repository';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    // private readonly roleRepository: RoleRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.get<PermissionEnum[]>(
        'permissions',
        context.getHandler(),
      ) || [];

    if (!requiredPermissions.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    console.log(user, 'THE USER HEHEH  ');

    console.log(requiredPermissions, 'THE REQUIRED PERMISSIONS HEHEH  ');
    return true; //to be changed later
    if (!user || !user.role) {
      return false;
    }

    // const roleDetails = await this.roleRepository.findOne({
    //   where: { title: user.role },
    //   relations: ['permissions'],
    // });

    // const userPermissions = roleDetails.permissions.map((p) => p.title);
    // return requiredPermissions.every((permission) =>
    //   userPermissions.includes(permission),
    // );
  }
}
