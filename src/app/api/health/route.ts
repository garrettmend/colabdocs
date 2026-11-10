import { getDb } from "@/lib/db";

// Used by Railway's deploy health check: a deploy only goes live if the app
// is configured and can reach its database.
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    console.error("Health check failed: SESSION_SECRET is not set");
    return Response.json({ ok: false, error: "SESSION_SECRET is not set" }, { status: 503 });
  }
  try {
    const db = await getDb();
    await db.execute("SELECT 1");
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Health check failed", err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
