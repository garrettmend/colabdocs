"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { AlertTriangle, ArrowLeft, Check, CloudOff, Eye, Loader2, Share2 } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { ROLE_LABEL } from "@/lib/access";
import type { DocumentDetail, DocumentSummary, UserRef } from "@/lib/documents";
import { Avatar } from "../Avatar";
import { UserMenu } from "../UserMenu";
import { RelativeTime } from "../RelativeTime";
import { Toolbar } from "./Toolbar";
import { ShareDialog } from "./ShareDialog";
import { ExportMenu } from "./ExportMenu";

const AUTOSAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 4000;
const DEFAULT_TITLE = "Untitled document";

type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

type Props = { doc: DocumentDetail; currentUser: UserRef };

/**
 * Editing model: autosave with a single in-flight request. Title and content
 * are saved together with the version we last saw; if someone else saved in
 * between, the server answers 409 and the user picks which version wins.
 */
export function DocumentEditor({ doc, currentUser }: Props) {
  const router = useRouter();
  const canEdit = doc.role !== "viewer";
  const isOwner = doc.role === "owner";

  const [title, setTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSaved, setLastSaved] = useState({ at: doc.updatedAt, by: doc.updatedBy });
  const [problem, setProblem] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Mutable save-loop state lives in a ref so async callbacks never see stale values.
  const sync = useRef({
    title: doc.title,
    content: doc.content,
    version: doc.version,
    dirty: false,
    inFlight: false,
    // Set while a conflict or a non-retryable error waits for the user.
    blocked: null as null | "conflict" | "error",
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  // Lets the save loop re-schedule itself without a self-referencing callback.
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async () => {
    const s = sync.current;
    clearTimeout(s.timer);
    if (s.inFlight || !s.dirty || s.blocked) return;

    s.inFlight = true;
    s.dirty = false;
    setSaveState("saving");
    let retryLater = false;

    try {
      const saved = await api<DocumentSummary>(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: s.title.trim() || DEFAULT_TITLE,
          content: s.content,
          version: s.version,
        }),
      });
      s.version = saved.version;
      setLastSaved({ at: saved.updatedAt, by: saved.updatedBy });
      setProblem(null);
    } catch (err) {
      s.dirty = true; // the edits are still only local
      const e = err instanceof ApiError ? err : new ApiError(0, "unknown", String(err));
      if (e.status === 409) {
        s.blocked = "conflict";
        setProblem(e.message);
        setSaveState("conflict");
      } else if (e.status >= 400 && e.status < 500) {
        // Validation / permission errors won't fix themselves; wait for the next edit.
        s.blocked = "error";
        setProblem(e.message);
        setSaveState("error");
      } else {
        retryLater = true; // network or server hiccup
        setProblem(e.message);
        setSaveState("error");
      }
    } finally {
      s.inFlight = false;
    }

    if (s.blocked) return;
    if (retryLater) s.timer = setTimeout(() => void flushRef.current(), RETRY_DELAY_MS);
    else if (s.dirty) s.timer = setTimeout(() => void flushRef.current(), 200); // edits arrived mid-save
    else setSaveState("saved");
  }, [doc.id]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const markDirty = useCallback(() => {
    const s = sync.current;
    s.dirty = true;
    if (s.blocked === "error") s.blocked = null; // a new edit is worth retrying
    if (s.blocked) return;
    setSaveState("unsaved");
    clearTimeout(s.timer);
    s.timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [flush]);

  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatches
    editable: canEdit,
    content: doc.content,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: !canEdit, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder: canEdit ? "Start writing…" : "" }),
    ],
    editorProps: {
      attributes: {
        class: "doc-content",
        "aria-label": "Document body",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: e }) => {
      sync.current.content = e.getHTML();
      markDirty();
    },
  });

  // Ctrl/⌘+S saves now; warn before leaving with unsaved edits; save when the tab is hidden.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sync.current.dirty || sync.current.inFlight) e.preventDefault();
    };
    const onHide = () => document.visibilityState === "hidden" && void flush();
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHide);
    const timer = sync.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(timer.timer);
    };
  }, [flush]);

  useEffect(() => {
    document.title = `${title.trim() || DEFAULT_TITLE} · ColabDocs`;
  }, [title]);

  async function goHome() {
    await flush();
    router.push("/");
    router.refresh();
  }

  // ---- conflict resolution
  async function resolveConflict(keep: "theirs" | "mine") {
    const s = sync.current;
    setSaveState("saving");
    try {
      const latest = await api<DocumentDetail>(`/api/documents/${doc.id}`);
      s.version = latest.version;
      s.blocked = null;
      setProblem(null);
      if (keep === "theirs") {
        s.title = latest.title;
        s.content = latest.content;
        s.dirty = false;
        setTitle(latest.title);
        editor?.commands.setContent(latest.content, { emitUpdate: false });
        setLastSaved({ at: latest.updatedAt, by: latest.updatedBy });
        setSaveState("saved");
      } else {
        s.dirty = true;
        await flush();
      }
    } catch (e) {
      setProblem((e as Error).message);
      setSaveState("error");
    }
  }

  const closeShare = useCallback(() => setShareOpen(false), []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link
            href="/"
            onClick={(e) => {
              e.preventDefault();
              void goHome();
            }}
            className="rounded-lg p-2 text-muted hover:bg-black/5"
            aria-label="Back to documents"
            title="Back to documents"
          >
            <ArrowLeft size={18} />
          </Link>

          <div className="min-w-0 flex-1">
            <input
              value={title}
              readOnly={!canEdit}
              maxLength={200}
              aria-label="Document title"
              onChange={(e) => {
                setTitle(e.target.value);
                sync.current.title = e.target.value;
                markDirty();
              }}
              onBlur={() => {
                if (!title.trim()) {
                  setTitle(DEFAULT_TITLE);
                  sync.current.title = DEFAULT_TITLE;
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && editor?.commands.focus("start")}
              className="w-full truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-medium hover:border-line focus:border-accent focus:outline-none read-only:hover:border-transparent"
            />
            <div className="flex items-center gap-2 px-2 text-xs text-muted">
              <SaveIndicator state={saveState} canEdit={canEdit} />
              <span aria-hidden>·</span>
              <span className="truncate">
                {lastSaved.by ? `Last edited by ${lastSaved.by.id === currentUser.id ? "you" : lastSaved.by.name} ` : "Edited "}
                <RelativeTime iso={lastSaved.at} />
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex" title={`Owner: ${doc.owner.name}`}>
            {!isOwner && <Avatar name={doc.owner.name} color={doc.owner.color} size="sm" />}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isOwner ? "bg-accent/10 text-accent" : canEdit ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"
              }`}
            >
              {isOwner ? "Owner" : `${ROLE_LABEL[doc.role]} · shared by ${doc.owner.name.split(" ")[0]}`}
            </span>
          </div>

          <ExportMenu title={title} getHtml={() => editor?.getHTML() ?? sync.current.content} />

          <button
            onClick={() => setShareOpen(true)}
            aria-label="Share"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
          >
            <Share2 size={16} /> <span className="hidden sm:inline">Share</span>
          </button>
          <UserMenu user={currentUser} />
        </div>
      </header>

      {saveState === "conflict" && (
        <Banner tone="warn">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{problem} Your latest edits are not saved yet.</span>
          <button onClick={() => resolveConflict("theirs")} className="rounded-md border border-amber-300 bg-white px-3 py-1 font-medium hover:bg-amber-100">
            Load latest version
          </button>
          <button onClick={() => resolveConflict("mine")} className="rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700">
            Keep my version
          </button>
        </Banner>
      )}
      {saveState === "error" && problem && (
        <Banner tone="error">
          <CloudOff size={16} className="shrink-0" />
          <span className="flex-1">Couldn&apos;t save: {problem}</span>
          <button
            onClick={() => {
              sync.current.blocked = null;
              void flush();
            }}
            className="rounded-md border border-red-300 bg-white px-3 py-1 font-medium hover:bg-red-100"
          >
            Retry now
          </button>
        </Banner>
      )}
      {!canEdit && (
        <Banner tone="info">
          <Eye size={16} className="shrink-0" />
          <span>
            You have view-only access. {doc.owner.name} owns this document; ask them for edit access.
          </span>
        </Banner>
      )}

      <main className="flex-1 px-4 pb-24">
        {canEdit && editor && (
          <div className="sticky top-16 z-10 mx-auto max-w-[816px] bg-background/95 py-3 backdrop-blur">
            <Toolbar editor={editor} />
          </div>
        )}
        <div className={`mx-auto max-w-[816px] ${canEdit ? "" : "pt-6"}`}>
          <article className="min-h-[70vh] rounded-sm border border-line bg-white px-6 py-10 shadow-sm sm:px-16 sm:py-14">
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="flex justify-center py-20 text-muted">
                <Loader2 className="animate-spin" />
              </div>
            )}
          </article>
          {editor && <WordCount editor={editor} />}
        </div>
      </main>

      {shareOpen && (
        <ShareDialog
          docId={doc.id}
          docTitle={title}
          isOwner={isOwner}
          currentUserId={currentUser.id}
          onClose={closeShare}
        />
      )}
    </div>
  );
}

function countWords(editor: Editor) {
  const { doc } = editor.state;
  // Separate blocks with spaces so words in adjacent paragraphs don't merge.
  return doc.textBetween(0, doc.content.size, " ", " ").split(/\s+/).filter(Boolean).length;
}

/** Mounted only once the editor exists, so the first count is the loaded document's. */
function WordCount({ editor }: { editor: Editor }) {
  const [words, setWords] = useState(() => countWords(editor));
  useEffect(() => {
    const update = () => setWords(countWords(editor));
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);
  return (
    <p className="mt-3 text-right text-xs text-muted">
      {words} {words === 1 ? "word" : "words"}
    </p>
  );
}

function SaveIndicator({ state, canEdit }: { state: SaveState; canEdit: boolean }) {
  if (!canEdit) return <span>View only</span>;
  const map: Record<SaveState, React.ReactNode> = {
    saved: (
      <>
        <Check size={12} /> All changes saved
      </>
    ),
    unsaved: <>Unsaved changes</>,
    saving: (
      <>
        <Loader2 size={12} className="animate-spin" /> Saving…
      </>
    ),
    error: <span className="text-red-600">Not saved</span>,
    conflict: <span className="text-amber-700">Not saved — conflict</span>,
  };
  return (
    <span className="inline-flex items-center gap-1" role="status" aria-live="polite">
      {map[state]}
    </span>
  );
}

function Banner({ tone, children }: { tone: "warn" | "error" | "info"; children: React.ReactNode }) {
  const styles = {
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  }[tone];
  return (
    <div role={tone === "info" ? "note" : "alert"} className={`border-b ${styles}`}>
      <div className="mx-auto flex max-w-[816px] flex-wrap items-center gap-3 px-4 py-2.5 text-sm">{children}</div>
    </div>
  );
}
