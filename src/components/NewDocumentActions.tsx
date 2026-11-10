"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2, Upload } from "lucide-react";
import { api } from "@/lib/client";
import type { DocumentDetail } from "@/lib/documents";

const ACCEPT = ".txt,.md,.markdown,.docx";
const MAX_BYTES = 2 * 1024 * 1024;

export function NewDocumentActions() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"new" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createBlank() {
    setBusy("new");
    setError(null);
    try {
      const doc = await api<DocumentDetail>("/api/documents", { method: "POST", body: "{}" });
      router.push(`/docs/${doc.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`"${file.name}" is larger than 2 MB.`);
      return;
    }
    setBusy("import");
    try {
      const form = new FormData();
      form.append("file", file);
      const doc = await api<DocumentDetail>("/api/documents/import", { method: "POST", body: form });
      router.push(`/docs/${doc.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="start-heading" className="mb-10">
      <h2 id="start-heading" className="mb-3 text-sm font-medium text-muted">
        Start a document
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={createBlank}
          disabled={busy !== null}
          className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 text-left shadow-sm transition hover:border-accent/50 hover:shadow disabled:opacity-60"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            {busy === "new" ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
          </span>
          <span>
            <span className="block font-medium">Blank document</span>
            <span className="block text-sm text-muted">Start writing from scratch</span>
          </span>
        </button>

        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 text-left shadow-sm transition hover:border-accent/50 hover:shadow disabled:opacity-60"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            {busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />}
          </span>
          <span>
            <span className="block font-medium">Import a file</span>
            <span className="block text-sm text-muted">
              .txt, .md or .docx up to 2 MB, opened as a new editable document
            </span>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          data-testid="import-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-selecting the same file after an error
            if (file) importFile(file);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
