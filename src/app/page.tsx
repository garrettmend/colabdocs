import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listDocuments } from "@/lib/documents";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { NewDocumentActions } from "@/components/NewDocumentActions";
import { DocumentList } from "@/components/DocumentList";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { owned, shared } = await listDocuments(await getDb(), user.id);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Logo />
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <NewDocumentActions />

        <DocumentList
          title="My documents"
          emptyText="You haven't created any documents yet. Start a blank one or import a file."
          docs={owned}
          variant="owned"
        />
        <DocumentList
          title="Shared with me"
          emptyText="Nothing has been shared with you yet. Documents other people share with you will appear here."
          docs={shared}
          variant="shared"
        />
      </main>
    </>
  );
}
