/**
 * Typed application errors. Service functions throw these; the API layer maps
 * them to HTTP responses in one place (see `src/lib/api.ts`).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = () =>
  new AppError(401, "unauthorized", "You need to sign in first.");

// Missing documents and documents the user cannot see both return 404 so the
// API never confirms that a private document exists.
export const notFound = (message = "Document not found.") =>
  new AppError(404, "not_found", message);

export const forbidden = (message: string) =>
  new AppError(403, "forbidden", message);

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, "bad_request", message, details);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError(409, "conflict", message, details);
