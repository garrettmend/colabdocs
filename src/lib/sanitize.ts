import sanitizeHtml from "sanitize-html";

/**
 * Document bodies are stored as HTML. Every write (editor saves and file
 * imports) goes through this allowlist, which mirrors what the editor can
 * produce. Anything else — scripts, event handlers, inline styles, images,
 * `javascript:` links — is dropped, so stored content is safe to render.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "h1", "h2", "h3",
    "strong", "em", "u", "s", "code",
    "ul", "ol", "li", "blockquote", "pre", "hr", "a",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    ol: ["start"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
    ins: "u",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
  // Keep the text of unknown wrappers (div, span, table cells…) but drop the tag.
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "title", "head"],
};

export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Plain-text preview for document lists. */
export function htmlToPreview(html: string, maxLength = 140): string {
  const text = sanitizeHtml(html.replace(/<\/(p|h[1-6]|li|blockquote)>/gi, " "), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
