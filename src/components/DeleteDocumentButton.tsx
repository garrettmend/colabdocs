"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/client";

export function DeleteDocumentButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    const ok = window.confirm(
      `Delete "${title}"? It will also disappear for everyone it is shared with. This can't be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      aria-label={`Delete ${title}`}
      title="Delete"
      className="rounded-lg p-2 text-muted opacity-60 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-40"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
    </button>
  );
}
