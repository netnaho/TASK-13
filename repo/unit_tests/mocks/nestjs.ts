export function Injectable(): ClassDecorator { return () => {}; }
export function InjectRepository(): ParameterDecorator { return () => {}; }
export function Module(): ClassDecorator { return () => {}; }
export function Controller(): ClassDecorator { return () => {}; }
export function Get(): MethodDecorator { return () => {}; }
export function Post(): MethodDecorator { return () => {}; }
export class HttpException extends Error { constructor(msg: string, public status: number) { super(msg); } }
export class NotFoundException extends HttpException { constructor(msg = 'Not Found') { super(msg, 404); } }
export class BadRequestException extends HttpException { constructor(msg = 'Bad Request') { super(msg, 400); } }
export class ForbiddenException extends HttpException { constructor(msg = 'Forbidden') { super(msg, 403); } }
export class UnauthorizedException extends HttpException { constructor(msg = 'Unauthorized') { super(msg, 401); } }
export class TooManyRequestsException extends HttpException { constructor(msg = 'Too Many Requests') { super(msg, 429); } }
export class ConflictException extends HttpException { constructor(msg = 'Conflict') { super(msg, 409); } }
