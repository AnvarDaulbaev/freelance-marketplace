import { BadRequestException, Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { LEGAL_DOC_VERSIONS, LegalDoc, SIGNUP_REQUIRED_DOCS } from '@fm/shared';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsString, MaxLength } from 'class-validator';
import { AuthUser, ClientMeta, CurrentUser, Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

class AcceptDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  docs: string[];

  @IsIn(['ru', 'en'])
  locale: 'ru' | 'en';
}

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Required documents whose current version the user has not accepted yet. */
  async pending(userId: string): Promise<LegalDoc[]> {
    const consents = await this.prisma.userConsent.findMany({
      where: { userId },
      select: { document: true, version: true },
    });
    const have = new Set(consents.map((c) => `${c.document}@${c.version}`));
    return SIGNUP_REQUIRED_DOCS.filter((d) => !have.has(`${d}@${LEGAL_DOC_VERSIONS[d]}`));
  }

  async accept(userId: string, dto: AcceptDto, meta: ClientMeta) {
    const unknown = dto.docs.filter((d) => !(d in LEGAL_DOC_VERSIONS));
    if (unknown.length) throw new BadRequestException({ message: 'unknown_docs', unknown });
    await this.prisma.userConsent.createMany({
      data: dto.docs.map((d) => ({
        userId,
        document: d,
        version: LEGAL_DOC_VERSIONS[d as LegalDoc],
        locale: dto.locale,
        ip: meta.ip,
        userAgent: meta.userAgent,
      })),
      skipDuplicates: true,
    });
    return { pending: await this.pending(userId) };
  }
}

@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Get('versions')
  versions() {
    return { versions: LEGAL_DOC_VERSIONS, requiredAtSignup: SIGNUP_REQUIRED_DOCS };
  }

  @Get('pending')
  async pending(@CurrentUser() user: AuthUser) {
    return { pending: await this.legal.pending(user.id) };
  }

  @Post('accept')
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptDto, @ClientMeta() meta: ClientMeta) {
    return this.legal.accept(user.id, dto, meta);
  }
}

@Module({ controllers: [LegalController], providers: [LegalService] })
export class LegalModule {}
