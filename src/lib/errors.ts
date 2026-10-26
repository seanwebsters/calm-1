export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "bad_request",
  ) {
    super(message);
  }
}

export class NotConfiguredError extends AppError {
  constructor(
    public readonly service: string,
    public readonly needs: string[],
  ) {
    super(`${service} is not configured. Set ${needs.join(", ")}.`, 503, "not_configured");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.") {
    super(message, 403, "forbidden");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sign in required.") {
    super(message, 401, "unauthorized");
  }
}

export class RateLimitedError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests.", 429, "rate_limited");
  }
}
