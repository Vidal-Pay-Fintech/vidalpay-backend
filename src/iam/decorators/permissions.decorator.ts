import { SetMetadata } from '@nestjs/common';
import { PermissionEnum } from 'src/utils/enums/permission.enum';

// permissions.decorator.ts
export const Permissions = (...permissions: PermissionEnum[]) =>
  SetMetadata('permissions', permissions);

// public.decorator.ts (for routes that don't require authentication)
export const Public = () => SetMetadata('isPublic', true);
