import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttler.guard';
import { AdminModule } from './admin/admin.module';
import { AuthGuard, RolesGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './common/audit.service';
import { LegalModule } from './legal/legal.module';
import { ModerationModule } from './moderation/moderation.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    // Per IP; generous because of CGNAT. Sensitive routes have their own lower limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    LegalModule,
    ProjectsModule,
    ProposalsModule,
    OrdersModule,
    ReportsModule,
    ModerationModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
