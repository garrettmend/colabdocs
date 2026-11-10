import { route, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createDocument, listDocuments } from "@/lib/documents";
import { requireUser } from "@/lib/session";

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json(await listDocuments(await getDb(), user.id));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = req.headers.get("content-length") === "0" ? {} : await readJson(req);
  const doc = await createDocument(await getDb(), user.id, body);
  return Response.json(doc, { status: 201 });
});
