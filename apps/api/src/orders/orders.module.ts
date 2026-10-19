import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException,
  Param, Post,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Throttle } from '@nestjs/throttler';
import { Order, OrderStatus, Prisma, ProjectStatus, Role } from '@prisma/client';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { orderForViewer } from './order-view';
import { canCancel, OrderAction, OrderActor, TERMINAL, TRANSITIONS } from './order-transitions';

class NoteDto {
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  note?: string;
}

class DisputeDto {
  @IsString()
  @Length(10, 5000)
  reason: string;
}

class MessageDto {
  @IsString()
  @Length(1, 5000)
  body: string;
}

class ReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  text?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Employer has this many days to review a delivery; silence = acceptance. */
const AUTO_ACCEPT_DAYS = Number(process.env.AUTO_ACCEPT_DAYS ?? 3);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  actorOf(order: Order, user: AuthUser): OrderActor | null {
    if (order.employerId === user.id) return 'employer';
    if (order.freelancerId === user.id) return 'freelancer';
    if (user.role === Role.ADMIN || user.role === Role.MODERATOR) return 'staff';
    return null;
  }

  async getForUser(id: string, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, title: true } },
        employer: { select: { id: true, name: true } },
        freelancer: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: 'asc' }, select: { id: true, from: true, to: true, note: true, createdAt: true } },
        dispute: {
          select: { id: true, status: true, reason: true, resolution: true, refundMinor: true, createdAt: true, resolvedAt: true },
        },
        reviews: true,
      },
    });
    if (!order || !this.actorOf(order, user)) throw new NotFoundException();
    return orderForViewer(order, user.id);
  }

  async mine(user: AuthUser) {
    const orders = await this.prisma.order.findMany({
      where: { OR: [{ employerId: user.id }, { freelancerId: user.id }] },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { project: { select: { id: true, title: true } } },
    });
    return orders.map((o) => orderForViewer(o, user.id));
  }

  /**
   * Runs one state-machine transition atomically. `inTx` runs inside the same
   * transaction for side effects that must succeed or fail together with it.
   */
  async act(
    id: string,
    user: AuthUser | null,
    action: Exclude<OrderAction, 'resolve'>,
    note?: string,
    inTx?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    const actor: OrderActor | null = user ? this.actorOf(order, user) : 'system';
    if (!actor) throw new NotFoundException();

    const t = TRANSITIONS[action];
    const allowed = action === 'cancel' ? canCancel(order.status, actor) : t.by.includes(actor) && t.from.includes(order.status);
    if (!allowed) throw new BadRequestException({ message: 'transition_not_allowed', status: order.status, action });

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock on status so concurrent actions can't both succeed.
      const { count } = await tx.order.updateMany({
        where: { id, status: order.status },
        data: {
          status: t.to,
          ...(t.to === OrderStatus.SUBMITTED && {
            submittedAt: now,
            autoAcceptAt: new Date(now.getTime() + AUTO_ACCEPT_DAYS * DAY_MS),
          }),
          ...(t.to === OrderStatus.REVISION && { autoAcceptAt: null }),
          ...(t.to === OrderStatus.COMPLETED && { completedAt: now, autoAcceptAt: null }),
          ...(t.to === OrderStatus.CANCELLED && { cancelledAt: now, autoAcceptAt: null }),
          ...(t.to === OrderStatus.DISPUTED && { autoAcceptAt: null }),
        },
      });
      if (count === 0) throw new BadRequestException('order_changed_concurrently');
      await tx.orderEvent.create({ data: { orderId: id, actorId: user?.id, from: order.status, to: t.to, note } });
      if (TERMINAL.includes(t.to)) {
        await tx.project.update({ where: { id: order.projectId }, data: { status: ProjectStatus.CLOSED } });
      }
      if (inTx) await inTx(tx);
      // TODO(payments): COMPLETED -> release escrow to freelancer wallet minus commission;
      // CANCELLED after funding -> refund escrow to employer. Write LedgerEntry rows here.
      return tx.order.findUniqueOrThrow({ where: { id } });
    });
    await this.audit.log(user?.id ?? null, `order.${action}`, 'Order', id, { from: order.status, to: t.to });
    return orderForViewer(updated, user?.id);
  }

  openDispute(id: string, user: AuthUser, reason: string) {
    return this.act(id, user, 'dispute', reason, (tx) =>
      tx.dispute.create({ data: { orderId: id, openedById: user.id, reason } }),
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async autoAcceptDue() {
    const due = await this.prisma.order.findMany({
      where: { status: OrderStatus.SUBMITTED, autoAcceptAt: { lte: new Date() } },
      select: { id: true },
      take: 200,
    });
    for (const { id } of due) {
      try {
        await this.act(id, null, 'auto_accept', 'auto-accepted: review period expired');
      } catch (e) {
        this.logger.warn(`auto-accept failed for ${id}: ${(e as Error).message}`);
      }
    }
  }

  async messages(id: string, user: AuthUser) {
    await this.getForUser(id, user);
    const latest = await this.prisma.message.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    return latest.reverse();
  }

  async postMessage(id: string, user: AuthUser, body: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    const actor = order && this.actorOf(order, user);
    if (!actor) throw new NotFoundException();
    // Staff may read the chat for disputes but never write into it.
    if (actor !== 'employer' && actor !== 'freelancer') throw new ForbiddenException();
    return this.prisma.message.create({ data: { orderId: id, authorId: user.id, body } });
  }

  async review(id: string, user: AuthUser, dto: ReviewDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    const actor = this.actorOf(order, user);
    if (actor !== 'employer' && actor !== 'freelancer') throw new ForbiddenException();
    if (order.status !== OrderStatus.COMPLETED) throw new BadRequestException('order_not_completed');
    return this.prisma.review.create({
      data: {
        orderId: id,
        authorId: user.id,
        targetId: actor === 'employer' ? order.freelancerId : order.employerId,
        rating: dto.rating,
        text: dto.text,
      },
    });
  }
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.mine(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.getForUser(id, user);
  }

  /** Manual escrow confirmation until a payment provider is integrated. */
  @Roles(Role.ADMIN)
  @Post(':id/fund')
  fund(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: NoteDto) {
    return this.orders.act(id, user, 'fund', dto.note);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: NoteDto) {
    return this.orders.act(id, user, 'submit', dto.note);
  }

  @Post(':id/revision')
  revision(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: NoteDto) {
    return this.orders.act(id, user, 'request_revision', dto.note);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.act(id, user, 'accept');
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: NoteDto) {
    return this.orders.act(id, user, 'cancel', dto.note);
  }

  @Post(':id/dispute')
  dispute(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: DisputeDto) {
    return this.orders.openDispute(id, user, dto.reason);
  }

  @Get(':id/messages')
  messages(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.messages(id, user);
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post(':id/messages')
  postMessage(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: MessageDto) {
    return this.orders.postMessage(id, user, dto.body);
  }

  @Post(':id/review')
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReviewDto) {
    return this.orders.review(id, user, dto);
  }
}

@Module({ controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
