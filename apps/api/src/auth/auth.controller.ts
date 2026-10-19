import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthUser, ClientMeta, CurrentUser, Public } from '../common/decorators';
import { ChangeEmailDto, ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';
import { SESSION_COOKIE } from './auth.guard';
import { AuthService } from './auth.service';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @ClientMeta() meta: ClientMeta, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.register(dto, meta);
    this.setCookie(res, token);
    return user;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @ClientMeta() meta: ClientMeta, @Res({ passthrough: true }) res: Response) {
    const { token } = await this.auth.login(dto, meta.ip);
    this.setCookie(res, token);
    return { ok: true };
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ClientMeta() meta: ClientMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.auth.changePassword(user.id, dto, meta);
    this.setCookie(res, token);
    return { ok: true };
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('change-email')
  changeEmail(@CurrentUser() user: AuthUser, @Body() dto: ChangeEmailDto, @ClientMeta() meta: ClientMeta) {
    return this.auth.changeEmail(user.id, dto, meta);
  }

  private setCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      // Must be true in production (HTTPS); false only for local http.
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: SESSION_MAX_AGE_MS,
      path: '/',
    });
  }
}
