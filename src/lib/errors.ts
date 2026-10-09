/** An expected, user-facing failure with a stable code (translated by the caller) and an HTTP status. */
export class AppError extends Error {
  constructor(public code: string, public status = 400, public details?: Record<string, unknown>) {
    super(code);
  }
}

export const notFound = (code = "not_found") => new AppError(code, 404);
export const forbidden = (code = "forbidden") => new AppError(code, 403);
export const unauthorized = (code = "unauthorized") => new AppError(code, 401);
export const conflict = (code: string, details?: Record<string, unknown>) => new AppError(code, 409, details);
export const tooMany = () => new AppError("rate_limited", 429);
