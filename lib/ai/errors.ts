export type AiErrorCode =
  | 'invalid_request'
  | 'authentication_required'
  | 'permission_denied'
  | 'provider_authentication'
  | 'provider_rate_limit'
  | 'provider_timeout'
  | 'provider_malformed_output'
  | 'provider_rejected_request'
  | 'provider_unavailable'
  | 'request_cancelled'
  | 'usage_limit'
  | 'usage_control_unavailable'
  | 'ai_disabled'
  | 'internal_error';

type AiProviderErrorOptions = {
  status?: number;
  retryable?: boolean;
  retryAfterSeconds?: number;
  providerRequestId?: string;
  cause?: unknown;
};

export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly providerRequestId?: string;

  constructor(code: AiErrorCode, message: string, options: AiProviderErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'AiProviderError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.providerRequestId = options.providerRequestId;
  }
}

export function toAiProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  return new AiProviderError(
    'provider_unavailable',
    'The translation provider is temporarily unavailable.',
    { retryable: true, cause: error }
  );
}

export function publicErrorStatus(code: AiErrorCode): number {
  switch (code) {
    case 'invalid_request':
      return 400;
    case 'authentication_required':
      return 401;
    case 'permission_denied':
      return 403;
    case 'provider_rate_limit':
    case 'usage_limit':
      return 429;
    case 'provider_timeout':
      return 504;
    case 'provider_malformed_output':
    case 'provider_rejected_request':
      return 502;
    case 'request_cancelled':
      return 499;
    case 'provider_authentication':
    case 'provider_unavailable':
    case 'usage_control_unavailable':
    case 'ai_disabled':
      return 503;
    default:
      return 500;
  }
}
