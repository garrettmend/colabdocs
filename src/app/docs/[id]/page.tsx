import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getDocument } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";
import { DocumentEditor } from "@/components/editor/DocumentEditor";

// One DB read per request, shared by generateMetadata and the page.
const loadDocument = cache(async (id: string) => {
  const user = await getCurrentUser();
  if (!user) return { user: null, doc: null };
  const doc = await getDocument(await getDb(), id, user.id).catch((err) => {
    if (err instanceof AppError && err.status === 404) return null;
    throw err;
  });
  return { user, doc };
});

export async function generateMetadata({ params }: PageProps<"/docs/[id]">): Promise<Metadata> {
  const { doc } = await loadDocument((await params).id);
  return { title: doc?.title ?? "Document" };
}

export default async function DocumentPage({ params }: PageProps<"/docs/[id]">) {
  const { user, doc } = await loadDocument((await params).id);
  if (!user) redirect("/login");
  if (!doc) notFound();

  // Keyed by document so navigating between docs resets all editor state.
  return <DocumentEditor key={doc.id} doc={doc} currentUser={user} />;
}
