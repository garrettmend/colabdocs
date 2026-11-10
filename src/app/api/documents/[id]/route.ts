import { route, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteDocument, getDocument, updateDocument } from "@/lib/documents";
import { requireUser } from "@/lib/session";

type Ctx = RouteContext<"/api/documents/[id]">;

export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return Response.json(await getDocument(await getDb(), id, user.id));
});

/** Body: { version, title?, content? } — 409 if `version` is stale. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return Response.json(await updateDocument(await getDb(), id, user.id, await readJson(req)));
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteDocument(await getDb(), id, user.id);
  return new Response(null, { status: 204 });
});
