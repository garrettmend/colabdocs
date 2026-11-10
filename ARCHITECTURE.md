# Architecture note

## What I prioritized and why

I chose depth over breadth: the parts that make a document tool trustworthy, each built end to end.

1. **An editor that feels solid.** Formatting that round-trips exactly (save, reload, same document), autosave with a clear status indicator, keyboard shortcuts, and a read-only mode for viewers.
2. **Access control enforced on the server.** One small permission model (owner / editor / viewer) checked in the service layer, so the UI can't be bypassed by calling the API directly.
3. **No silent data loss.** Without real-time sync, two people editing the same document is the most likely way to lose work. Versioned saves turn that into a visible, recoverable choice.
4. **A deploy anyone can try straight away.** Seeded accounts and demo documents, so the sharing flow can be tested in under two minutes.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | **Next.js 16** (App Router, TypeScript) | One deployable unit for UI and API. Server components read data directly, and route handlers give a plain REST API for mutations. |
| Editor | **TipTap 3** (ProseMirror) | Mature schema-based editor: formatting is structural, not ad-hoc `contenteditable` HTML. |
| Storage | **SQLite via libSQL** | Zero-setup local file for development and tests, and a file on a persistent volume in production. The same client also talks to hosted libSQL (Turso), so the hosting choice never touches application code. |
| Import | `marked` (.md), `mammoth` (.docx) | Pure JS: no native or system dependencies to install on the host. |
| Validation | `zod` + `sanitize-html` | Input shape checks, plus an HTML allowlist on every write. |
| Tests | **Vitest** against a real temporary SQLite database | Tests the actual SQL and constraints, not mocks. |
| Hosting | **Railway**: one service plus a volume | One long-running Node process with a persistent disk. Nothing else to provision, and no serverless cold starts. |

Cache Components (on by default in the Next 16 scaffold) is turned off: every page is per-user, so there is no static shell worth prerendering, and the classic dynamic model keeps session reads simple.

## Data model

```
users(id, email UNIQUE, name, color)
documents(id, owner_id → users, title, content HTML, version, created_at, updated_at, updated_by)
document_shares(document_id, user_id, role ∈ {editor, viewer}, created_at)   PK(document_id, user_id)
meta(key, value)   -- e.g. "seeded_at", so demo data is seeded exactly once
```

- **Ownership is a column, not a share row.** Every document has exactly one owner, and a user can't be both owner and sharee.
- **Content is stored as sanitized HTML.** It is the editor's native interchange format, imports produce it directly, and it exports cleanly to Markdown or HTML. ProseMirror JSON would be stricter, but it would need a server-side DOM to convert imports, and that cost wasn't worth it at this scope. Every write goes through an allowlist that matches the editor's schema (no scripts, event handlers, styles, images or `javascript:` links). Stored content is therefore safe even if someone bypasses the UI.

## Access model

`src/lib/access.ts` defines the full model in about 15 lines:

| Capability | Owner | Editor | Viewer |
| --- | :-: | :-: | :-: |
| View | ✓ | ✓ | ✓ |
| Edit content / rename | ✓ | ✓ | |
| Share, change roles, revoke | ✓ | | |
| Delete | ✓ | | |

Every service function in `src/lib/documents.ts` resolves the caller's role first. Users with **no access get 404, not 403**, so the API never confirms that a private document exists. Errors are typed (`AppError`) and mapped to one JSON shape in a single wrapper (`src/lib/api.ts`).

## Saving and concurrency

- The client keeps **one save in flight at a time**. Edits are debounced by 800 ms, and title and content are saved together with the `version` the client last saw.
- The server runs `UPDATE … SET version = version + 1 WHERE id = ? AND version = ?`. If no row changes, someone else saved first: **409 Conflict**, including who saved and when.
- The editor then stops autosaving and offers **Load latest version** or **Keep my version** (re-fetch the version, then re-save). Network or 5xx failures retry automatically. 4xx failures wait for the user.
- Unsaved changes are flushed on Ctrl/⌘+S, when the tab is hidden, and before going back to the document list. Closing the tab with pending edits triggers the browser's "leave site?" warning.

This is deliberately **not** real-time co-editing. CRDT sync (e.g. Yjs + a WebSocket server) is the right long-term answer, but it is a much larger build: a WebSocket service, CRDT document storage, and presence. Conflict detection gives the most important guarantee, no lost work, for a small fraction of the cost.

## Deployment

Railway runs `next start` as a single service, with the SQLite file on an attached volume. If no database is configured in production, the app refuses to start rather than writing to the container's ephemeral disk. A `/api/health` check gates each deploy on config and database reachability.

**Trade-off:** a SQLite file means one instance, which is plenty for an internal tool at this stage. To scale out, point `DATABASE_URL` at hosted libSQL (Turso) and add replicas. That is a configuration change, not a code change.

## Auth (simulated, but not trivially forgeable)

Visitors pick a seeded account. The session is the user id plus an **HMAC-SHA256 signature** in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). Users can't edit the cookie to become someone else, and cross-site form posts don't carry it. Swapping in real auth (e.g. OAuth or magic links) only changes `session.ts` and the sign-in page. Everything downstream works from a user id.

## Security and validation summary

- Server-side permission checks on every read and write. 404 for no access.
- Zod validation: title 1–200 characters, content ≤ 1 MB, role enum, email format, positive integer version.
- HTML sanitized on every write. Imports are checked for extension, size (≤ 2 MB), empty files, invalid UTF-8, and the `.docx` zip signature.
- Production refuses to start without `SESSION_SECRET` and `DATABASE_URL`.

## Intentionally deprioritized

- **Real-time collaboration, presence and cursors** (see above).
- **Real authentication and sign-up.** Seeded accounts keep the demo path short.
- **Comments, suggestions and version history.** Valuable, but each is a feature area of its own.
- **Images, tables and attachments in documents.** These need blob storage and a larger editor schema.
- **Pagination and search on the document list.** Not needed at demo scale.
- **Dark mode.** The document "paper" is light, and colors are CSS tokens, so dark mode is a contained change later.

## What I'd build next

1. **Version history:** a `document_versions` table written on each save (or every N minutes), with "restore this version". The versioned save path makes this a natural next step.
2. **Live "someone else is editing" indicator:** poll or SSE the document version every few seconds. Refresh automatically when there are no local edits, and warn before a conflict happens instead of after.
3. **Comments** anchored to text ranges (TipTap marks + a `comments` table).
4. **Playwright end-to-end tests** for the share flow and conflict banner. These are currently verified manually in a browser.
5. **Self-service "leave document"** for sharees, and sharing by link.
