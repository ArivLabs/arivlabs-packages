const mockChild = jest.fn().mockReturnThis();

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: mockChild,
};

const pino = jest.fn(() => mockLogger) as jest.Mock & {
  stdSerializers: {
    req: jest.Mock;
    res: jest.Mock;
    err: jest.Mock;
  };
};

pino.stdSerializers = {
  req: jest.fn(),
  res: jest.fn(),
  err: jest.fn(),
};

export default pino;
