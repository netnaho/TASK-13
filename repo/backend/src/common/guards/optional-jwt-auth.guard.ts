import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JWT_SECRET } from '../config/secrets';
import { JwtPayload } from './jwt-auth.guard';

/**
 * Like JwtAuthGuard but never throws — routes remain accessible to
 * unauthenticated callers. When a valid Bearer token is present, req.user
 * is populated exactly as JwtAuthGuard would; otherwise req.user is left unset.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = this.jwtService.verify<JwtPayload>(token, {
          secret: JWT_SECRET,
        });
        (request as Request & { user: JwtPayload }).user = payload;
      } catch {
        // Invalid/expired token → treat as unauthenticated, do not reject
      }
    }

    return true;
  }
}
