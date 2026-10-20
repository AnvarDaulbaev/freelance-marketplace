import {
  Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { ContentSource, ProjectStatus, Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { MAX_AMOUNT_SOM } from '../common/limits';
import { ContentGuardService } from '../common/content-guard.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

export class CreateProjectDto {
  @IsString()
  @Length(5, 150)
  title: string;

  @IsString()
  @Length(20, 10_000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  /** Budget in whole som; stored in tyiyn. */
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(MAX_AMOUNT_SOM)
  budget?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  deadlineDays?: number;
}

class ListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;
}

const PAGE_SIZE = 20;
const STAFF: Role[] = [Role.ADMIN, Role.MODERATOR];

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService, private readonly guard: ContentGuardService) {}

  async list(query: ListQuery) {
    const page = query.page ?? 1;
    const where = {
      status: ProjectStatus.OPEN,
      ...(query.category && { category: { slug: query.category } }),
      ...(query.q && {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' as const } },
          { description: { contains: query.q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          category: true,
          employer: { select: { id: true, name: true } },
          _count: { select: { proposals: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);
    return { items, total, page, pageSize: PAGE_SIZE };
  }

  async get(id: string, viewer?: AuthUser) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      omit: { hiddenById: true, hiddenByRole: true },
      include: {
        category: true,
        employer: { select: { id: true, name: true, createdAt: true } },
        _count: { select: { proposals: true } },
      },
    });
    if (!project) throw new NotFoundException();
    const isOwner = viewer?.id === project.employerId;
    const isStaff = !!viewer && STAFF.includes(viewer.role);
    if (project.status === ProjectStatus.HIDDEN && !isOwner && !isStaff) throw new NotFoundException();
    return project;
  }

  async create(employerId: string, dto: CreateProjectDto) {
    const title = this.guard.screen(dto.title.trim());
    const description = this.guard.screen(dto.description.trim());
    const project = await this.prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          employerId,
          title: title.text,
          description: description.text,
          categoryId: dto.categoryId,
          budgetMinor: dto.budget != null ? dto.budget * 100 : null,
          deadlineDays: dto.deadlineDays,
        },
      });
      await this.guard.flag(tx, { userId: employerId, source: ContentSource.PROJECT, entityId: p.id }, title, description);
      return p;
    });
    return { ...project, contactsHidden: title.masked || description.masked };
  }

  mine(employerId: string) {
    return this.prisma.project.findMany({
      where: { employerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { proposals: true } } },
    });
  }

  async close(id: string, user: AuthUser) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException();
    if (project.employerId !== user.id) throw new ForbiddenException();
    if (project.status !== ProjectStatus.OPEN) throw new ForbiddenException('only_open_projects_can_be_closed');
    return this.prisma.project.update({ where: { id }, data: { status: ProjectStatus.CLOSED } });
  }

  categories() {
    return this.prisma.category.findMany({ orderBy: { slug: 'asc' } });
  }
}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Public()
  @Get()
  list(@Query() query: ListQuery) {
    return this.projects.list(query);
  }

  @Public()
  @Get('categories')
  categories() {
    return this.projects.categories();
  }

  @Roles(Role.EMPLOYER)
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.projects.mine(user.id);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.projects.get(id, user);
  }

  @Roles(Role.EMPLOYER)
  @Throttle({ default: { ttl: 10 * 60_000, limit: 10 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, dto);
  }

  @Roles(Role.EMPLOYER)
  @Post(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projects.close(id, user);
  }
}

@Module({ controllers: [ProjectsController], providers: [ProjectsService], exports: [ProjectsService] })
export class ProjectsModule {}
