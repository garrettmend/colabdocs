"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

type Props = { title: string; getHtml: () => string };

function safeFilename(title: string) {
  return (title.trim() || "Untitled document").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 100);
}

function download(filename: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Client-side export of the current editor content. */
export function ExportMenu({ title, getHtml }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function exportMarkdown() {
    const { default: TurndownService } = await import("turndown");
    const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
    td.addRule("underline", { filter: ["u"], replacement: (content) => `<u>${content}</u>` });
    td.addRule("strike", { filter: ["s"], replacement: (content) => `~~${content}~~` });
    download(`${safeFilename(title)}.md`, "text/markdown;charset=utf-8", td.turndown(getHtml()));
    setOpen(false);
  }

  function exportHtml() {
    const escaped = title.replace(/</g, "&lt;");
    const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escaped}</title></head>\n<body>\n${getHtml()}\n</body></html>\n`;
    download(`${safeFilename(title)}.html`, "text/html;charset=utf-8", html);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Download"
        aria-label="Download"
        className="rounded-full p-2 text-muted hover:bg-black/5"
      >
        <Download size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-line bg-white p-1.5 shadow-lg">
          <button role="menuitem" onClick={exportMarkdown} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5">
            Markdown (.md)
          </button>
          <button role="menuitem" onClick={exportHtml} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5">
            Web page (.html)
          </button>
        </div>
      )}
    </div>
  );
}
