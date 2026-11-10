import { AppError, badRequest } from "./errors";

/**
 * Wraps a route handler so thrown `AppError`s become consistent JSON errors:
 *   { "error": { "code": "conflict", "message": "...", "details": {...} } }
 * Unexpected errors are logged and returned as a generic 500.
 */
export function route<Ctx>(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return Response.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status },
        );
      }
      console.error("Unhandled API error", err);
      return Response.json(
        { error: { code: "internal", message: "Something went wrong. Please try again." } },
        { status: 500 },
      );
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}
