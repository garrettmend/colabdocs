import Link from "next/link";
import { FileText } from "lucide-react";
import { ROLE_LABEL } from "@/lib/access";
import type { DocumentSummary } from "@/lib/documents";
import { Avatar } from "./Avatar";
import { DeleteDocumentButton } from "./DeleteDocumentButton";
import { RelativeTime } from "./RelativeTime";

type Props = {
  title: string;
  emptyText: string;
  docs: DocumentSummary[];
  variant: "owned" | "shared";
};

const ROLE_STYLE = {
  owner: "bg-accent/10 text-accent",
  editor: "bg-emerald-500/10 text-emerald-700",
  viewer: "bg-amber-500/10 text-amber-700",
} as const;

export function DocumentList({ title, emptyText, docs, variant }: Props) {
  return (
    <section className="mb-10" aria-label={title}>
      <h2 className="mb-3 text-base font-semibold">
        {title} <span className="ml-1 text-sm font-normal text-muted">{docs.length}</span>
      </h2>

      {docs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white/50 px-5 py-8 text-center text-sm text-muted">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          {docs.map((doc) => (
            <li key={doc.id} className="group relative flex items-center gap-4 px-5 py-4 hover:bg-black/[0.02]">
              <FileText size={20} className="shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                {/* The ::after overlay makes the whole row clickable. */}
                <Link href={`/docs/${doc.id}`} className="block truncate font-medium after:absolute after:inset-0">
                  {doc.title}
                </Link>
                <p className="truncate text-sm text-muted">{doc.preview || "Empty document"}</p>
              </div>

              {variant === "shared" && (
                <div className="hidden shrink-0 items-center gap-2 text-sm text-muted sm:flex" title="Owner">
                  <Avatar name={doc.owner.name} color={doc.owner.color} size="sm" />
                  <span>{doc.owner.name}</span>
                </div>
              )}

              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLE[doc.role]}`}>
                {ROLE_LABEL[doc.role]}
              </span>

              <span className="hidden w-36 shrink-0 text-right text-xs text-muted md:block">
                <RelativeTime iso={doc.updatedAt} />
                {doc.updatedBy && <span className="block truncate">by {doc.updatedBy.name}</span>}
              </span>

              {variant === "owned" && (
                <div className="relative z-10 shrink-0">
                  <DeleteDocumentButton id={doc.id} title={doc.title} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
