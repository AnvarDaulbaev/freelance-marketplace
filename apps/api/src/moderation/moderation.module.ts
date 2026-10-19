import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, ParseEnumPipe, Post, Query,
} from '@nestjs/common';
import { DisputeStatus, OrderStatus, ProjectStatus, ReportStatus, Role, UserStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { MAX_AMOUNT_SOM } from '../common/limits';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

class ReasonDto {
  @IsString()
  @Length(3, 2000)
  reason: string;
}

class HandleReportDto {
  @IsIn([ReportStatus.ACTIONED, ReportStatus.DISMISSED])
  status: ReportStatus;
}

class ResolveDisputeDto {
  @IsIn([DisputeStatus.RESOLVED_FOR_EMPLOYER, DisputeStatus.RESOLVED_FOR_FREELANCER, DisputeStatus.RESOLVED_SPLIT])
  status: DisputeStatus;

  @IsString()
  @Length(10, 5000)
  resolution: string;

  /** Required for RESOLVED_SPLIT: amount refunded to the employer, whole som. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_SOM)
  refund?: number;
}

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  reports(status: ReportStatus = ReportStatus.OPEN) {
    return this.prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        author: { select: { id: true, name: true } },
        targetUser: { select: { id: true, name: true, status: true } },
        project: { select: { id: true, title: true, status: true } },
      },
    });
  }

  async handleReport(id: string, staff: AuthUser, status: ReportStatus) {
    const r = await this.prisma.report.update({
      where: { id },
      data: { status, handledById: staff.id, handledAt: new Date() },
    });
    await this.audit.log(staff.id, 'report.handle', 'Report', id, { status });
    return r;
  }

  async setProjectHidden(id: string, staff: AuthUser, hidden: boolean, reason?: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException();
    if (hidden && project.status !== ProjectStatus.OPEN) throw new BadRequestException('only_open_projects');
    if (!hidden && project.status !== ProjectStatus.HIDDEN) throw new BadRequestException('not_hidden');
    if (!hidden) this.assertCanReverse(project.hiddenByRole, staff);
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        status: hidden ? ProjectStatus.HIDDEN : ProjectStatus.OPEN,
        moderationNote: hidden ? reason : null,
        hiddenById: hidden ? staff.id : null,
        hiddenByRole: hidden ? staff.role : null,
      },
    });
    await this.audit.log(staff.id, hidden ? 'project.hide' : 'project.unhide', 'Project', id, { reason });
    return updated;
  }

  async setUserBlocked(id: string, staff: AuthUser, blocked: boolean, reason?: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException();
    if (target.id === staff.id) throw new ForbiddenException('cannot_block_self');
    // Moderators can only act on regular users; only an admin can block staff.
    const targetIsStaff = target.role === Role.ADMIN || target.role === Role.MODERATOR;
    if (targetIsStaff && staff.role !== Role.ADMIN) throw new ForbiddenException();
    if (target.role === Role.ADMIN) throw new ForbiddenException('cannot_block_admin');

    if (!blocked) this.assertCanReverse(target.blockedByRole, staff);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: blocked ? UserStatus.BLOCKED : UserStatus.ACTIVE,
        blockReason: blocked ? reason : null,
        blockedById: blocked ? staff.id : null,
        blockedByRole: blocked ? staff.role : null,
      },
      select: { id: true, name: true, status: true, blockReason: true },
    });
    await this.audit.log(staff.id, blocked ? 'user.block' : 'user.unblock', 'User', id, { reason });
    return updated;
  }

  /**
   * A moderator can't undo a block/hide an admin applied. Uses the role the
   * decider had at decision time, so demoting that admin later changes nothing.
   */
  private assertCanReverse(decidedByRole: Role | null, staff: AuthUser) {
    if (decidedByRole === Role.ADMIN && staff.role !== Role.ADMIN) throw new ForbiddenException('decided_by_admin');
  }

  disputes(status: DisputeStatus = DisputeStatus.OPEN) {
    return this.prisma.dispute.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        order: {
          include: {
            project: { select: { id: true, title: true } },
            employer: { select: { id: true, name: true } },
            freelancer: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async resolveDispute(id: string, staff: AuthUser, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id }, include: { order: true } });
    if (!dispute || dispute.status !== DisputeStatus.OPEN) throw new NotFoundException();
    const { order } = dispute;
    if (staff.id === order.employerId || staff.id === order.freelancerId) {
      throw new ForbiddenException('cannot_resolve_own_dispute');
    }
    const isSplit = dto.status === DisputeStatus.RESOLVED_SPLIT;
    if (!isSplit && dto.refund != null) throw new BadRequestException('refund_only_for_split');
    const refundMinor = isSplit && dto.refund != null ? dto.refund * 100 : null;
    if (isSplit && (!refundMinor || refundMinor >= order.amountMinor)) {
      throw new BadRequestException('split_requires_partial_refund');
    }
    const to = dto.status === DisputeStatus.RESOLVED_FOR_EMPLOYER ? OrderStatus.CANCELLED : OrderStatus.COMPLETED;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Conditional updates: if two moderators resolve at once, only one wins.
      const d = await tx.dispute.updateMany({
        where: { id, status: DisputeStatus.OPEN },
        data: { status: dto.status, resolution: dto.resolution, refundMinor, resolvedById: staff.id, resolvedAt: now },
      });
      const o = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.DISPUTED },
        data: { status: to, ...(to === OrderStatus.COMPLETED ? { completedAt: now } : { cancelledAt: now }) },
      });
      if (d.count === 0 || o.count === 0) throw new ConflictException('dispute_already_resolved');
      await tx.orderEvent.create({
        data: { orderId: order.id, actorId: staff.id, from: OrderStatus.DISPUTED, to, note: dto.resolution },
      });
      await tx.project.update({ where: { id: order.projectId }, data: { status: ProjectStatus.CLOSED } });
      // TODO(payments): move escrow per resolution (refund / release / split) via LedgerEntry.
    });
    await this.audit.log(staff.id, 'dispute.resolve', 'Dispute', id, { status: dto.status, refundMinor });
    return this.prisma.dispute.findUnique({ where: { id } });
  }

  /** IP addresses and change details (e.g. old/new email) are personal data: admins only. */
  auditLog(viewer: AuthUser, entityType?: string, entityId?: string) {
    const full = viewer.role === Role.ADMIN;
    return this.prisma.auditLog.findMany({
      where: { ...(entityType && { entityType }), ...(entityId && { entityId }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        data: full,
        ip: full,
        actor: { select: { id: true, name: true, role: true } },
      },
    });
  }
}

@Roles(Role.MODERATOR)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly mod: ModerationService) {}

  @Get('reports')
  reports(@Query('status', new ParseEnumPipe(ReportStatus, { optional: true })) status?: ReportStatus) {
    return this.mod.reports(status);
  }

  @Post('reports/:id')
  handleReport(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: HandleReportDto) {
    return this.mod.handleReport(id, user, dto.status);
  }

  @Post('projects/:id/hide')
  hide(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReasonDto) {
    return this.mod.setProjectHidden(id, user, true, dto.reason);
  }

  @Post('projects/:id/unhide')
  unhide(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.mod.setProjectHidden(id, user, false);
  }

  @Post('users/:id/block')
  block(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReasonDto) {
    return this.mod.setUserBlocked(id, user, true, dto.reason);
  }

  @Post('users/:id/unblock')
  unblock(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.mod.setUserBlocked(id, user, false);
  }

  @Get('disputes')
  disputes(@Query('status', new ParseEnumPipe(DisputeStatus, { optional: true })) status?: DisputeStatus) {
    return this.mod.disputes(status);
  }

  @Post('disputes/:id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ResolveDisputeDto) {
    return this.mod.resolveDispute(id, user, dto);
  }

  @Get('audit')
  audit(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    if ((entityType?.length ?? 0) > 32 || (entityId?.length ?? 0) > 64) throw new BadRequestException('invalid_input');
    return this.mod.auditLog(user, entityType, entityId);
  }
}

@Module({ controllers: [ModerationController], providers: [ModerationService] })
export class ModerationModule {}
