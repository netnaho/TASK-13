import { Controller, Post, Body, Req, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.CREATED)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Headers('x-device-fingerprint') deviceFingerprint?: string,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress ?? undefined;
    return this.authService.login(dto, ip, deviceFingerprint);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
