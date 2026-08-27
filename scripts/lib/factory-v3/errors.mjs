export class FactoryV3Error extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FactoryV3Error';
    this.code = code;
    this.details = details;
  }
}

export function fail(code, message, details) {
  throw new FactoryV3Error(code, message, details);
}

export function invariant(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}
