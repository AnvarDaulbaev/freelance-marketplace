import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LEGAL_DOC_VERSIONS, LegalDoc, SIGNUP_REQUIRED_DOCS } from '@fm/shared';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit.service';
import { ClientMeta } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { HashPool } from './hash-pool';
import { LoginLimiter } from './login-limiter';
import { ChangeEmailDto, ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  locale: true,
  country: true,
  bio: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly limiter: LoginLimiter,
    private readonly hashes: HashPool,
  ) {}

  /** Compared against when the email is unknown, so response time doesn't reveal which emails exist. */
  private readonly dummyHash = bcrypt.hashSync('dummy-password-for-timing', 12);

  async register(dto: RegisterDto, meta: ClientMeta) {
    const missing = SIGNUP_REQUIRED_DOCS.filter((d) => !dto.acceptedDocs.includes(d));
    if (missing.length) throw new BadRequestException({ message: 'legal_docs_required', missing });

    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('email_taken');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await this.hashes.hash(dto.password),
        name: dto.name.trim(),
        role: dto.role,
        locale: dto.locale,
        country: dto.country?.toUpperCase(),
        consents: {
          create: SIGNUP_REQUIRED_DOCS.map((doc: LegalDoc) => ({
            document: doc,
            version: LEGAL_DOC_VERSIONS[doc],
            locale: dto.locale,
            ip: meta.ip,
            userAgent: meta.userAgent,
          })),
        },
      },
      select: publicUserSelect,
    });
    await this.audit.log(user.id, 'user.register', 'User', user.id, { role: user.role }, meta.ip);
    return { user, token: await this.sign(user.id, 0) };
  }

  async login(dto: LoginDto, ip?: string) {
    const email = dto.email.toLowerCase().trim();
    this.limiter.assertAllowed(email, ip);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await this.hashes.compare(dto.password, user?.passwordHash ?? this.dummyHash);
    if (!user || !ok) {
      this.limiter.recordFailure(email, ip);
      throw new UnauthorizedException('invalid_credentials');
    }
    this.limiter.reset(email, ip);
    if (user.status === 'BLOCKED') throw new UnauthorizedException('account_blocked');
    return { token: await this.sign(user.id, user.sessionVersion) };
  }

  /** Changes the password and signs out every other session. Returns a fresh token for this one. */
  async changePassword(userId: string, dto: ChangePasswordDto, meta: ClientMeta) {
    await this.verifyPassword(userId, dto.currentPassword);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.hashes.hash(dto.newPassword), sessionVersion: { increment: 1 } },
    });
    await this.audit.log(userId, 'user.password_change', 'User', userId, undefined, meta.ip);
    return { token: await this.sign(user.id, user.sessionVersion) };
  }

  async changeEmail(userId: string, dto: ChangeEmailDto, meta: ClientMeta) {
    const current = await this.verifyPassword(userId, dto.currentPassword);
    const email = dto.newEmail.toLowerCase().trim();
    if (email !== current.email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException('email_taken');
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data: { email }, select: publicUserSelect });
    await this.audit.log(userId, 'user.email_change', 'User', userId, { from: current.email, to: email }, meta.ip);
    return user;
  }

  private async verifyPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.hashes.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('wrong_password');
    }
    return user;
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
  }

  private sign(userId: string, sessionVersion: number) {
    return this.jwt.signAsync({ sub: userId, v: sessionVersion });
  }
}
