import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  sessionId: string;
}

export type AuthedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC = 'isPublic';
/** Route accessible sans connexion (l'utilisateur est tout de même identifié s'il est connecté). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Restreint la route aux rôles indiqués. Le rôle est toujours lu depuis la base, jamais depuis la requête. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
