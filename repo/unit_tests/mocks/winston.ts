const fakeLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

export function createLogger(_opts?: any) {
  return fakeLogger;
}

export const format = {
  combine: (..._args: any[]) => ({}),
  timestamp: (_opts?: any) => ({}),
  errors: (_opts?: any) => ({}),
  json: () => ({}),
  colorize: () => ({}),
  simple: () => ({}),
};

export const transports = {
  Console: class Console {
    constructor(_opts?: any) {}
  },
};
