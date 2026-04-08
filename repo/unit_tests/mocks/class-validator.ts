/**
 * Stub mock for class-validator.
 *
 * Unit tests in this suite import backend DTOs that are decorated with
 * class-validator decorators.  The tests do not perform HTTP request
 * validation, so the decorators only need to be importable no-ops — they must
 * not throw and must return valid MethodDecorator / PropertyDecorator values.
 */

const noop = (..._args: any[]): PropertyDecorator => () => {};

export const IsString = noop;
export const IsOptional = noop;
export const IsObject = noop;
export const IsIn = noop;
export const IsBoolean = noop;
export const IsNumber = noop;
export const IsInt = noop;
export const IsArray = noop;
export const IsNotEmpty = noop;
export const IsEmail = noop;
export const IsEnum = noop;
export const IsUUID = noop;
export const IsDateString = noop;
export const IsUrl = noop;
export const Matches = noop;
export const MinLength = noop;
export const MaxLength = noop;
export const Min = noop;
export const Max = noop;
export const ValidateNested = noop;
export const Type = noop;
export const validate = async () => [];
export const validateSync = () => [];
