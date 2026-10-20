import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post,
} from '@nestjs/common';
import { calculateCommission } from '@fm/shared';
import { ContentSource, OrderStatus, ProjectStatus, ProposalStatus, Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { MAX_AMOUNT_SOM } from '../common/limits';
import { AuditService } from '../common/audit.service';
import { ContentGuardService } from '../common/content-guard.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { orderForViewer } from '../orders/order-view';
import { PrismaService } from '../prisma/prisma.service';

class CreateProposalDto {
  @IsString()
  @Length(20, 5000)
  coverLetter: string;

  /** Price in whole som. */
  @IsInt()
  @Min(100)
  @Max(MAX_AMOUNT_SOM)
  price: number;

  @IsInt()
  @Min(1)
  @Max(365)
  deadlineDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly guard: ContentGuardService,
  ) {}

  async create(projectId: string, freelancerId: string, dto: CreateProposalDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.status !== ProjectStatus.OPEN) throw new NotFoundException('project_not_open');
    if (project.employerId === freelancerId) throw new ForbiddenException();
    const exists = await this.prisma.proposal.findUnique({
      where: { projectId_freelancerId: { projectId, freelancerId } },
    });
    if (exists) throw new ConflictException('already_proposed');
    const screened = this.guard.screen(dto.coverLetter.trim());
    const proposal = await this.prisma.$transaction(async (tx) => {
      const p = await tx.proposal.create({
        data: {
          projectId,
          freelancerId,
          coverLetter: screened.text,
          priceMinor: dto.price * 100,
          currency: project.currency,
          deadlineDays: dto.deadlineDays,
        },
      });
      await this.guard.flag(tx, { userId: freelancerId, source: ContentSource.PROPOSAL, entityId: p.id }, screened);
      return p;
    });
    return { ...proposal, contactsHidden: screened.masked };
  }

  /** Employer (owner) and staff see every proposal; a freelancer sees only their own. */
  async listForProject(projectId: string, user: AuthUser) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    const seesAll = project.employerId === user.id || user.role === Role.ADMIN || user.role === Role.MODERATOR;
    return this.prisma.proposal.findMany({
      where: { projectId, ...(seesAll ? {} : { freelancerId: user.id }) },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { freelancer: { select: { id: true, name: true, createdAt: true } } },
    });
  }

  mine(freelancerId: string) {
    return this.prisma.proposal.findMany({
      where: { freelancerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { project: { select: { id: true, title: true, status: true } } },
    });
  }

  async withdraw(id: string, user: AuthUser) {
    const p = await this.prisma.proposal.findUnique({ where: { id } });
    if (!p || p.freelancerId !== user.id) throw new NotFoundException();
    if (p.status !== ProposalStatus.PENDING) throw new BadRequestException('not_pending');
    return this.prisma.proposal.update({ where: { id }, data: { status: ProposalStatus.WITHDRAWN } });
  }

  /**
   * Employer picks a proposal: an order is created with the commission
   * snapshot, the project moves to IN_PROGRESS and the other proposals are
   * rejected.
   */
  async accept(id: string, user: AuthUser) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id }, include: { project: true } });
    if (!proposal || proposal.project.employerId !== user.id) throw new NotFoundException();
    if (proposal.status !== ProposalStatus.PENDING || proposal.project.status !== ProjectStatus.OPEN) {
      throw new BadRequestException('cannot_accept');
    }

    const c = calculateCommission(proposal.priceMinor);
    const order = await this.prisma.$transaction(async (tx) => {
      // Guard against two concurrent accepts on the same project.
      const { count } = await tx.project.updateMany({
        where: { id: proposal.projectId, status: ProjectStatus.OPEN },
        data: { status: ProjectStatus.IN_PROGRESS },
      });
      if (count === 0) throw new ConflictException('project_already_taken');

      await tx.proposal.update({ where: { id }, data: { status: ProposalStatus.ACCEPTED } });
      await tx.proposal.updateMany({
        where: { projectId: proposal.projectId, id: { not: id }, status: ProposalStatus.PENDING },
        data: { status: ProposalStatus.REJECTED },
      });
      return tx.order.create({
        data: {
          projectId: proposal.projectId,
          proposalId: id,
          employerId: user.id,
          freelancerId: proposal.freelancerId,
          amountMinor: c.amountMinor,
          currency: proposal.currency,
          commissionBps: c.rateBps,
          commissionMinor: c.commissionMinor,
          payoutMinor: c.payoutMinor,
          deadlineAt: new Date(Date.now() + proposal.deadlineDays * DAY_MS),
          events: { create: { actorId: user.id, to: OrderStatus.AWAITING_PAYMENT } },
        },
      });
    });
    await this.audit.log(user.id, 'proposal.accept', 'Order', order.id, { proposalId: id });
    return orderForViewer(order, user.id);
  }
}

@Controller()
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Roles(Role.FREELANCER)
  @Throttle({ default: { ttl: 10 * 60_000, limit: 30 } })
  @Post('projects/:projectId/proposals')
  create(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateProposalDto) {
    return this.proposals.create(projectId, user.id, dto);
  }

  @Get('projects/:projectId/proposals')
  list(@Param('projectId') projectId: string, @CurrentUser() user: AuthUser) {
    return this.proposals.listForProject(projectId, user);
  }

  @Roles(Role.FREELANCER)
  @Get('proposals/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.proposals.mine(user.id);
  }

  @Roles(Role.FREELANCER)
  @Post('proposals/:id/withdraw')
  withdraw(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.proposals.withdraw(id, user);
  }

  @Roles(Role.EMPLOYER)
  @Post('proposals/:id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.proposals.accept(id, user);
  }
}

@Module({ controllers: [ProposalsController], providers: [ProposalsService] })
export class ProposalsModule {}
