import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(dto);
    await this.sessions.create(user.id, req.headers['user-agent'], res);
    return this.auth.me(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validateCredentials(dto.identifier, dto.password);
    await this.sessions.create(user.id, req.headers['user-agent'], res);
    return this.auth.me(user.id);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser | undefined, @Res({ passthrough: true }) res: Response) {
    if (user) await this.sessions.revoke(user.sessionId);
    this.sessions.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('password/change')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, user.sessionId, dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(204)
  @Post('password/forgot')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('password/reset')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthUser) {
    const items = await this.auth.listSessions(user.id);
    return items.map((s) => ({ ...s, current: s.id === user.sessionId }));
  }

  @Delete('sessions/:id')
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.revokeSession(user.id, id);
  }
}
