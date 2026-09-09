export type ProviderErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
  retry_after: number | null;
};

export class ProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfter: number | null;
  readonly httpStatus: number;

  constructor(
    code: string,
    message: string,
    options: { retryable: boolean; retryAfter?: number | null; httpStatus?: number },
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options.retryable;
    this.retryAfter = options.retryAfter ?? null;
    this.httpStatus = options.httpStatus ?? 502;
  }

  toBody(): ProviderErrorBody {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      retry_after: this.retryAfter,
    };
  }
}

export function invalidRequest(message: string): ProviderError {
  return new ProviderError("invalid_request", message, {
    retryable: false,
    httpStatus: 400,
  });
}

export function timeoutError(message: string): ProviderError {
  return new ProviderError("timeout", message, { retryable: true, httpStatus: 504 });
}

export function unavailable(message: string, retryAfter: number | null = 5): ProviderError {
  return new ProviderError("unavailable", message, {
    retryable: true,
    retryAfter,
    httpStatus: 503,
  });
}
