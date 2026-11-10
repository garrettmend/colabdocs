"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import type { UserRef } from "@/lib/documents";
import { Avatar } from "@/components/Avatar";

export function AccountPicker({ users, currentUserId }: { users: UserRef[]; currentUserId: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(userId: string) {
    setPending(userId);
    setError(null);
    try {
      await api("/api/session", { method: "POST", body: JSON.stringify({ userId }) });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPending(null);
    }
  }

  return (
    <div className="mt-5 space-y-2">
      {users.map((u) => (
        <button
          key={u.id}
          onClick={() => choose(u.id)}
          disabled={pending !== null}
          className="flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition hover:border-accent/50 hover:bg-accent/5 disabled:opacity-60"
        >
          <Avatar name={u.name} color={u.color} />
          <span className="flex-1">
            <span className="block text-sm font-medium">
              {u.name}
              {u.id === currentUserId && <span className="ml-2 text-xs font-normal text-muted">(signed in)</span>}
            </span>
            <span className="block text-xs text-muted">{u.email}</span>
          </span>
          {pending === u.id ? (
            <Loader2 size={16} className="animate-spin text-muted" />
          ) : (
            <ChevronRight size={16} className="text-muted" />
          )}
        </button>
      ))}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
