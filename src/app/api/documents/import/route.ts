import { route } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { badRequest } from "@/lib/errors";
import { convertFileToDocument } from "@/lib/importers";
import { requireUser } from "@/lib/session";

/** multipart/form-data with a single `file` field → a new document owned by the caller. */
export const POST = route(async (req) => {
  const user = await requireUser();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart form upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a file to import.");

  const { title, content } = await convertFileToDocument(file.name, new Uint8Array(await file.arrayBuffer()));
  const doc = await createDocument(await getDb(), user.id, { title, content });
  return Response.json(doc, { status: 201 });
});
