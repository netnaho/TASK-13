const noop = (..._args: any[]) => {};

const fakeLogger = {
  info: noop,
  error: noop,
  warn: noop,
  debug: noop,
  verbose: noop,
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
