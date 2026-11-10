import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getUser, parseInput } from "@/lib/documents";
import { badRequest } from "@/lib/errors";
import { endSession, startSession } from "@/lib/session";

const loginInput = z.object({ userId: z.string().min(1) });

/** Sign in as one of the seeded demo accounts. */
export const POST = route(async (req) => {
  const { userId } = parseInput(loginInput, await readJson(req));
  const user = await getUser(await getDb(), userId);
  if (!user) throw badRequest("Unknown demo account.");
  await startSession(user.id);
  return Response.json({ user });
});

export const DELETE = route(async () => {
  await endSession();
  return new Response(null, { status: 204 });
});
