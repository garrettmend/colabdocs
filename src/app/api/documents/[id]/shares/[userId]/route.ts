import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { revokeShare } from "@/lib/documents";
import { requireUser } from "@/lib/session";

export const DELETE = route(async (_req, ctx: RouteContext<"/api/documents/[id]/shares/[userId]">) => {
  const user = await requireUser();
  const { id, userId } = await ctx.params;
  await revokeShare(await getDb(), id, user.id, userId);
  return new Response(null, { status: 204 });
});
