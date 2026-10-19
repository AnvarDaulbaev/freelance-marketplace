import {
  Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Query,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { IsIn } from 'class-validator';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/** ADMIN is granted and revoked only from the server CLI (npm run admin:create). */
const ASSIGNABLE_ROLES = [Role.MODERATOR, Role.EMPLOYER, Role.FREELANCER] as const;

class SetRoleDto {
  @IsIn(ASSIGNABLE_ROLES)
  role: (typeof ASSIGNABLE_ROLES)[number];
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  users(q?: string) {
    return this.prisma.user.findMany({
      where: q
        ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, email: true, name: true, role: true, status: true, blockReason: true, createdAt: true },
    });
  }

  async setRole(id: string, admin: AuthUser, role: Role) {
    if (id === admin.id) throw new ForbiddenException('cannot_change_own_role');
    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) throw new NotFoundException();
    // One compromised admin account must not be able to remove the others.
    if (target.role === Role.ADMIN) throw new ForbiddenException('admin_role_is_cli_only');
    const user = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, role: true },
    });
    await this.audit.log(admin.id, 'user.role', 'User', id, { from: target.role, to: role });
    return user;
  }

  async stats() {
    const [users, projects, completed, revenue] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.project.groupBy({ by: ['status'], _count: true }),
      this.prisma.order.count({ where: { status: OrderStatus.COMPLETED } }),
      this.prisma.order.aggregate({
        where: { status: OrderStatus.COMPLETED },
        _sum: { amountMinor: true, commissionMinor: true },
      }),
    ]);
    return {
      users,
      projects,
      completedOrders: completed,
      turnoverMinor: revenue._sum.amountMinor ?? 0,
      commissionMinor: revenue._sum.commissionMinor ?? 0,
    };
  }
}

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users(@Query('q') q?: string) {
    return this.admin.users(q);
  }

  @Patch('users/:id/role')
  setRole(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: SetRoleDto) {
    return this.admin.setRole(id, user, dto.role);
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
