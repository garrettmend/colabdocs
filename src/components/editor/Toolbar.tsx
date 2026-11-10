"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Code2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";

type BlockType = "paragraph" | "h1" | "h2" | "h3";

export function Toolbar({ editor }: { editor: Editor }) {
  // Toolbar re-renders only when one of these derived values changes.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      block: (e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "paragraph") as BlockType,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function setBlock(value: BlockType) {
    if (value === "paragraph") chain().setParagraph().run();
    else chain().setHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run();
  }

  function toggleLink() {
    if (s.link) {
      chain().extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = window.prompt("Link URL", "https://");
    if (!url || url === "https://") return;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) {
      window.alert("Links must start with http://, https:// or mailto:");
      return;
    }
    chain().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-white px-2 py-1.5 shadow-sm"
    >
      <Btn label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!s.canUndo}>
        <Undo2 size={16} />
      </Btn>
      <Btn label="Redo (Ctrl+Shift+Z)" onClick={() => chain().redo().run()} disabled={!s.canRedo}>
        <Redo2 size={16} />
      </Btn>
      <Sep />
      <select
        aria-label="Text style"
        value={s.block}
        onChange={(e) => setBlock(e.target.value as BlockType)}
        className="h-8 rounded-md border border-transparent bg-transparent px-2 text-sm hover:bg-black/5 focus:border-line focus:outline-none"
      >
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Sep />
      <Btn label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold size={16} />
      </Btn>
      <Btn label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic size={16} />
      </Btn>
      <Btn label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline size={16} />
      </Btn>
      <Btn label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough size={16} />
      </Btn>
      <Btn label="Link" active={s.link} onClick={toggleLink}>
        <Link2 size={16} />
      </Btn>
      <Sep />
      <Btn label="Bulleted list" active={s.bulletList} onClick={() => chain().toggleBulletList().run()}>
        <List size={16} />
      </Btn>
      <Btn label="Numbered list" active={s.orderedList} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered size={16} />
      </Btn>
      <Btn label="Quote" active={s.blockquote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote size={16} />
      </Btn>
      <Btn label="Code block" active={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
        <Code2 size={16} />
      </Btn>
      <Sep />
      <Btn label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting size={16} />
      </Btn>
    </div>
  );
}

function Btn(props: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active ?? undefined}
      disabled={props.disabled}
      // Keep the editor's selection when clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition disabled:opacity-35 ${
        props.active ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-black/5"
      }`}
    >
      {props.children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-line" />;
}
