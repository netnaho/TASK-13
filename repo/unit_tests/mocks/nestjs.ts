export function Injectable(..._args: any[]): ClassDecorator { return () => {}; }
export function InjectRepository(..._args: any[]): ParameterDecorator { return () => {}; }
export function Module(..._args: any[]): ClassDecorator { return () => {}; }
export function Controller(..._args: any[]): ClassDecorator { return () => {}; }
export function Get(..._args: any[]): MethodDecorator { return () => {}; }
export function Post(..._args: any[]): MethodDecorator { return () => {}; }
export class HttpException extends Error { constructor(msg: string, public status: number) { super(msg); } }
export class NotFoundException extends HttpException { constructor(msg = 'Not Found') { super(msg, 404); } }
export class BadRequestException extends HttpException { constructor(msg = 'Bad Request') { super(msg, 400); } }
export class ForbiddenException extends HttpException { constructor(msg = 'Forbidden') { super(msg, 403); } }
export class UnauthorizedException extends HttpException { constructor(msg = 'Unauthorized') { super(msg, 401); } }
export class TooManyRequestsException extends HttpException { constructor(msg = 'Too Many Requests') { super(msg, 429); } }
export class ConflictException extends HttpException { constructor(msg = 'Conflict') { super(msg, 409); } }
export interface LoggerService { log(...args: any[]): any; error(...args: any[]): any; warn(...args: any[]): any; debug?(...args: any[]): any; verbose?(...args: any[]): any; [key: string]: any; }
export interface OnModuleInit { onModuleInit(): any; }
export interface OnModuleDestroy { onModuleDestroy(): any; }
export enum HttpStatus {
  OK = 200,
  ACCEPTED = 202,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
}
