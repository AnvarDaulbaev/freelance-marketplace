import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { IS_PUBLIC, ROLES } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

export const SESSION_COOKIE = 'fm_session';

/**
 * Resolves the session cookie on every request. Public routes still get
 * `req.user` when a valid session exists. Blocked users are rejected even if
 * their token has not expired yet.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[SESSION_COOKIE];

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; v?: number }>(token);
        const found = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, role: true, email: true, status: true, sessionVersion: true },
        });
        // A password change invalidates every session issued before it.
        const user = found && found.sessionVersion === (payload.v ?? 0) ? found : null;
        if (user?.status === 'BLOCKED' && !isPublic) {
          throw new ForbiddenException('account_blocked');
        }
        if (user && user.status === 'ACTIVE') req.user = { id: user.id, role: user.role, email: user.email };
      } catch (e) {
        if (e instanceof ForbiddenException) throw e;
        // invalid/expired token: treat as anonymous
      }
    }

    if (!isPublic && !req.user) throw new UnauthorizedException();
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException();
    if (user.role === Role.ADMIN || roles.includes(user.role)) return true;
    throw new ForbiddenException();
  }
}
