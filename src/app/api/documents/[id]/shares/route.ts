import { route, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listShares, shareDocument } from "@/lib/documents";
import { requireUser } from "@/lib/session";

type Ctx = RouteContext<"/api/documents/[id]/shares">;

export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return Response.json(await listShares(await getDb(), id, user.id));
});

/** Body: { email, role: "editor" | "viewer" } — adds or updates access. */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const share = await shareDocument(await getDb(), id, user.id, await readJson(req));
  return Response.json(share, { status: 201 });
});
