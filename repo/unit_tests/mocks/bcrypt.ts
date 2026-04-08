/**
 * Pure-JS bcrypt mock for unit tests.
 *
 * Why this exists
 * ---------------
 * The real bcrypt package uses a native C++ addon (.node file).  When Jest
 * runs multiple worker processes simultaneously, loading that addon in several
 * processes at once causes a SIGSEGV on Linux (especially on machines where
 * memory address randomisation interacts poorly with multiple dlopen() calls).
 *
 * Unit tests in this suite never need real password hashing — they test
 * business logic and security properties that are independent of the actual
 * hash algorithm.  Replacing bcrypt with a deterministic pure-JS stub
 * eliminates the crash completely while keeping every test meaningful.
 *
 * Mock contract
 * -------------
 * hashSync / hash  :  '$mock$<cleartext>'
 * compareSync / compare : true iff encrypted === '$mock$<data>'
 * genSalt          :  '$mock-salt$'
 *
 * The prefix ensures that a real bcrypt hash (starting with '$2b$') will never
 * accidentally compare equal to a mock hash.
 */

const MOCK_PREFIX = '$mock$';

export function hashSync(data: string | Buffer, _saltOrRounds: string | number): string {
  return MOCK_PREFIX + String(data);
}

export function hash(data: string | Buffer, _saltOrRounds: string | number): Promise<string> {
  return Promise.resolve(hashSync(data, _saltOrRounds));
}

export function compareSync(data: string | Buffer, encrypted: string): boolean {
  return encrypted === MOCK_PREFIX + String(data);
}

export function compare(data: string | Buffer, encrypted: string): Promise<boolean> {
  return Promise.resolve(compareSync(data, encrypted));
}

export function genSaltSync(_rounds?: number): string {
  return '$mock-salt$';
}

export function genSalt(_rounds?: number): Promise<string> {
  return Promise.resolve(genSaltSync(_rounds));
}

export function getRounds(_encrypted: string): number {
  return 10;
}
