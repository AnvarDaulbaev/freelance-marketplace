import { BadRequestException, Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

class CreateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectId?: string;

  @IsString()
  @Length(10, 2000)
  reason: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  create(authorId: string, dto: CreateReportDto) {
    if (!dto.targetUserId && !dto.projectId) throw new BadRequestException('target_required');
    return this.prisma.report.create({ data: { authorId, ...dto } });
  }
}

/** Any signed-in user can report a user or a project to moderators. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Throttle({ default: { ttl: 60 * 60_000, limit: 20 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user.id, dto);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
