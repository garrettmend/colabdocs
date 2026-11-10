import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function DocumentNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-sm text-center">
        <FileQuestion className="mx-auto mb-4 text-muted" size={40} />
        <h1 className="text-lg font-semibold">Document not available</h1>
        <p className="mt-2 text-sm text-muted">
          It may have been deleted, or it hasn&apos;t been shared with the account you&apos;re signed in as.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
            Back to documents
          </Link>
          <Link href="/login" className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">
            Switch account
          </Link>
        </div>
      </div>
    </main>
  );
}
