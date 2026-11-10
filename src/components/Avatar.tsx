import { initials } from "@/lib/client";

type Props = { name: string; color: string; size?: "sm" | "md"; title?: string };

export function Avatar({ name, color, size = "md", title }: Props) {
  const dims = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span
      title={title ?? name}
      className={`${dims} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white`}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}
