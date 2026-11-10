"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Users } from "lucide-react";
import { api } from "@/lib/client";
import type { UserRef } from "@/lib/documents";
import { Avatar } from "./Avatar";

export function UserMenu({ user }: { user: UserRef }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-black/5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
      >
        <Avatar name={user.name} color={user.color} />
        <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-white p-2 shadow-lg">
          <div className="px-3 py-2">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted">{user.email}</div>
          </div>
          <div className="my-1 border-t border-line" />
          <button
            role="menuitem"
            onClick={() => router.push("/login")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5"
          >
            <Users size={16} /> Switch demo account
          </button>
          <button
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
