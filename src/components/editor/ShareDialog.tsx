"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "@/lib/client";
import type { Share, UserRef } from "@/lib/documents";
import type { ShareRole } from "@/lib/access";
import { Avatar } from "../Avatar";

type Props = {
  docId: string;
  docTitle: string;
  isOwner: boolean;
  currentUserId: string;
  onClose: () => void;
};

const DEMO_EMAILS = ["alice@colabdocs.test", "bob@colabdocs.test", "carol@colabdocs.test"];

export function ShareDialog({ docId, docTitle, isOwner, currentUserId, onClose }: Props) {
  const [owner, setOwner] = useState<UserRef | null>(null);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      api<{ owner: UserRef; shares: Share[] }>(`/api/documents/${docId}/shares`).then(
        (data) => {
          setOwner(data.owner);
          setShares(data.shares);
        },
        (e: Error) => setError(e.message),
      ),
    [docId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function upsert(targetEmail: string, targetRole: ShareRole, key: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const share = await api<Share>(`/api/documents/${docId}/shares`, {
        method: "POST",
        body: JSON.stringify({ email: targetEmail, role: targetRole }),
      });
      await load();
      return share;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const share = await upsert(email, role, "add");
    if (share) {
      setNotice(`${share.user.name} ${role === "editor" ? "can now edit" : "can now view"} this document.`);
      setEmail("");
    }
  }

  async function remove(userId: string, name: string) {
    setBusy(userId);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/documents/${docId}/shares/${userId}`, { method: "DELETE" });
      setNotice(`Removed ${name}'s access.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const sharedEmails = new Set([owner?.email, ...(shares ?? []).map((s) => s.user.email)]);
  const suggestions = DEMO_EMAILS.filter((e) => !sharedEmails.has(e));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="share-title" className="text-lg font-semibold">
            Share &ldquo;<span className="break-all">{docTitle}</span>&rdquo;
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-black/5">
            <X size={18} />
          </button>
        </div>

        {isOwner ? (
          <form onSubmit={onSubmit} className="mt-4">
            <div className="flex gap-2">
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Add people by email"
                aria-label="Email address"
                list="demo-emails"
                className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <datalist id="demo-emails">
                {suggestions.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ShareRole)}
                aria-label="Access level"
                className="rounded-lg border border-line bg-white px-2 text-sm"
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button
                type="submit"
                disabled={busy !== null || !email.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {busy === "add" && <Loader2 size={14} className="animate-spin" />} Share
              </button>
            </div>
            {suggestions.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Demo accounts:{" "}
                {suggestions.map((e, i) => (
                  <span key={e}>
                    <button type="button" className="underline hover:text-accent" onClick={() => setEmail(e)}>
                      {e}
                    </button>
                    {i < suggestions.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            )}
          </form>
        ) : (
          <p className="mt-3 rounded-lg bg-black/[0.03] px-3 py-2 text-sm text-muted">
            Only the owner can change who has access to this document.
          </p>
        )}

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

        <h3 className="mt-6 text-sm font-medium">People with access</h3>
        {!owner || !shares ? (
          <div className="flex justify-center py-6 text-muted">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : (
          <ul className="mt-2 space-y-1">
            <Person user={owner} you={owner.id === currentUserId}>
              <span className="text-sm text-muted">Owner</span>
            </Person>
            {shares.map((s) => (
              <Person key={s.user.id} user={s.user} you={s.user.id === currentUserId}>
                {isOwner ? (
                  <div className="flex items-center gap-1">
                    <select
                      value={s.role}
                      disabled={busy !== null}
                      onChange={(e) => upsert(s.user.email, e.target.value as ShareRole, s.user.id)}
                      aria-label={`Access level for ${s.user.name}`}
                      className="rounded-md border border-transparent bg-transparent px-1 py-1 text-sm hover:border-line"
                    >
                      <option value="editor">Can edit</option>
                      <option value="viewer">Can view</option>
                    </select>
                    <button
                      onClick={() => remove(s.user.id, s.user.name)}
                      disabled={busy !== null}
                      aria-label={`Remove ${s.user.name}`}
                      title="Remove access"
                      className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      {busy === s.user.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-muted">{s.role === "editor" ? "Can edit" : "Can view"}</span>
                )}
              </Person>
            ))}
            {shares.length === 0 && <li className="px-2 py-2 text-sm text-muted">Not shared with anyone yet.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function Person({ user, you, children }: { user: UserRef; you: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/[0.02]">
      <Avatar name={user.name} color={user.color} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {user.name} {you && <span className="font-normal text-muted">(you)</span>}
        </div>
        <div className="truncate text-xs text-muted">{user.email}</div>
      </div>
      {children}
    </li>
  );
}
