# AI workflow note

## Tools used

- **Claude Code (Claude Opus 5.5)** in the Claude desktop app: planning, implementation, tests and documentation drafts.
- Claude Code's **built-in browser** for driving the running app: typing with real keyboard shortcuts, switching accounts, checking API responses from the page.
- **Claude in Chrome** for configuring the Railway service (volume, domain, deploy) and checking the live site visually.
- Standard tooling as the source of truth: `tsc`, ESLint (with React Compiler rules), Vitest, `next build`, and `curl` against the production server.

## Where AI materially sped things up

- **Scaffolding and boilerplate:** route handlers, typed error mapping, and the zod schemas took minutes instead of an hour.
- **The service layer and its tests together.** Writing access rules and the tests that pin them down in the same pass made it cheap to cover many edge cases: 404 vs 403, self-share, unknown email, role changes, orphaned share rows.
- **Editor UI.** TipTap toolbar wiring, the share dialog and the export menu are mostly mechanical code.
- **Verification.** Scripted browser checks (type, format, reload, switch user, attempt forbidden writes) made it fast to re-test the whole flow after each change.

## A call I made myself: where it runs

Claude Code's plan was **Vercel plus a hosted Turso database**, and it wrote the deployment docs that way. I overrode it and chose **Railway**, where my other projects already run.

That wasn't just a hosting swap. It changed the storage design for the better:

- **One fewer vendor.** A long-running server with a persistent volume means the SQLite file can live next to the app. That removes the separate database account, its credentials, and a network hop on every query.
- **New failure modes to guard against.** A container's own disk is wiped on redeploy, so a missing volume would silently lose every document. The app now resolves its database location explicitly: an explicit `DATABASE_URL`, then the Railway volume, and in production it refuses to start rather than fall back to the container disk. A `/api/health` check gates each deploy, so a misconfiguration fails loudly instead of going live broken. Tests cover the resolution order.
- **Nothing locked in.** The same libSQL client still works with Turso by setting `DATABASE_URL`, so scaling out later is a configuration change.

I also kept the one secret out of the AI's hands. Claude Code set up the Railway service through the browser, but I entered `SESSION_SECRET` myself, and it never saw the value.

## What I changed or rejected from AI output

| AI-generated or default output | What I did instead | Why |
| --- | --- | --- |
| Named SQL parameters (`:userId`) | Switched to numbered positional parameters (`?1`) | The local and hosted libSQL drivers resolve named-parameter prefixes differently. Positional parameters behave the same in both, which removes a bug that would only appear after deploying. |
| Next 16 scaffold default `cacheComponents: true` | Turned it off | Every page is per-user. That mode would require Suspense boundaries around every session read, for no benefit here. |
| Save-loop `useCallback` that scheduled itself; `setState` inside effects | Rewrote with a ref-held callback and `useSyncExternalStore` | Flagged by the React Compiler lint rules. The originals worked, but they risked stale closures and extra renders. |
| Sign-in page that read the database before reading cookies | Marked it `force-dynamic` | `next build` tried to prerender it and crashed without a DB URL. Only running a real production build caught this. |
| `.docx` import that silently dropped underline | Added a mammoth style map and a test | Found by importing the sample file and checking the output, not by the first round of tests. |
| Conflict banner saying "Load their version" | "Load latest version" / "Keep my version" | The other save can come from *you* in another tab. Found while testing that exact case. |
| Imported docs titled after the filename | Use the document's first `# Heading` when present | `meeting-notes.md` → "Weekly sync — notes" is what a user expects. |
| Word count read from TipTap's `CharacterCount` storage | Count words from the document directly, in a component mounted once the editor exists | It showed "0 words" on every document. Every test, lint and build check passed; it was only caught by looking at the deployed site. |

Approaches I rejected outright:

- **Real-time co-editing (Yjs/CRDT):** a much larger build that needs a stateful server. Replaced with versioned saves and explicit conflict resolution.
- **SQLite on the container's own disk:** container disks are ephemeral, so documents would vanish on every redeploy. The database lives on a persistent Railway volume instead, and production refuses to start without one (or a `DATABASE_URL`).
- **Storing ProseMirror JSON:** stricter, but import conversion would need a server-side DOM. Sanitized HTML matching the editor's schema was the pragmatic choice.

## How I verified correctness, UX and reliability

- **Automated:** 17 Vitest tests against a real temporary SQLite database cover create/save/reopen with formatting, validation, HTML sanitization, the full permission matrix, 404-for-no-access, role changes and revocation, delete cascade, optimistic-concurrency conflicts, `.md`/`.txt`/`.docx` import plus rejected files, session tamper detection, and database-location resolution.
- **End-to-end in a browser:** created a document and formatted it with keyboard shortcuts and the toolbar, renamed it, reloaded to confirm persistence, shared it as viewer, switched users to confirm the read-only editor *and* a 403 from the API, forced a conflict and resolved it, and imported a Markdown file through the real upload input.
- **Production mode:** ran `next build` + `next start` and checked with `curl`: unauthenticated 401, redirect to sign-in, forged cookie rejected, `Secure`/`HttpOnly` cookie flags, malformed JSON → 400, unsupported upload → 415.
- **Live deployment:** checked against the Railway URL that the health check passes, that sharing, viewer 403s, no-access 404s, stale-save conflicts and import all work, and that data survives a redeploy (seeded documents kept their original timestamps). Test documents were deleted afterwards.
- **Static checks:** `tsc` and ESLint clean.
