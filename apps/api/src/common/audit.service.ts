import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    data?: Prisma.InputJsonValue,
    ip?: string,
  ) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entityType, entityId, data, ip },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
