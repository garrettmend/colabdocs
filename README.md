# ColabDocs

A lightweight collaborative document editor: create and format documents, import files, and share them with other people as editors or viewers.

Built with Next.js 16, TypeScript, TipTap (ProseMirror) and SQLite (libSQL). Deploys to Railway as a single service with a persistent volume.

**Live demo:** https://colabdocs-production.up.railway.app

## Demo accounts

Sign-in is simulated: pick an account on the sign-in page (no passwords). Switch accounts from the avatar menu (top right) → **Switch demo account**.

| Account | Email | Starts with |
| --- | --- | --- |
| Alice Chen | `alice@colabdocs.test` | Owns *Welcome to ColabDocs* (shared with Bob as editor, Carol as viewer). Can view Bob's *Q4 planning notes*. |
| Bob Rivera | `bob@colabdocs.test` | Owns *Q4 planning notes*. Can edit *Welcome to ColabDocs*. |
| Carol Okafor | `carol@colabdocs.test` | Can view *Welcome to ColabDocs* (read-only). |

### Try it in two minutes

1. Sign in as **Alice** → open *Welcome to ColabDocs* → edit text, try **bold / italic / underline**, headings and lists. Watch the "Saving… → All changes saved" indicator. Reload: everything is still there.
2. Rename the document by editing its title (top left).
3. Go back → **Import a file** → pick one of the files in [`samples/`](samples) (`.md`, `.txt`, `.docx`). It opens as a new editable document.
4. Click **Share** → add `carol@colabdocs.test` as **Can view** (or `bob@colabdocs.test` as **Can edit**).
5. Switch to **Carol** → the document appears under **Shared with me** with a *Can view* badge; the editor is read-only.
6. Switch to **Bob** → open *Welcome to ColabDocs* → he can edit but can't change sharing or delete.

## Features

- **Documents:** create, rename, edit, autosave (debounced, plus Ctrl/⌘+S), reopen, delete (owner only), export as Markdown or HTML.
- **Rich text** (TipTap/ProseMirror): bold, italic, underline, strikethrough, headings 1–3, bulleted and numbered lists, quotes, code blocks, links, undo/redo.
- **File import:** `.txt`, `.md`/`.markdown` and `.docx` up to **2 MB** become a new document. Headings, lists, bold/italic/underline and links are kept. Images, tables, colors and fonts are not imported. Other file types are rejected with a clear message.
- **Sharing:** every document has one owner, who can grant **Can edit** or **Can view** access by email, change roles, or revoke access. The home page separates **My documents** from **Shared with me** and shows each document's owner and your access level.
- **Safe concurrent edits:** saves carry the document version. If someone else saved since you opened the document, your save is rejected (HTTP 409) and you choose **Load latest version** or **Keep my version**. Nobody's work is overwritten without them knowing.
- **Persistence:** SQLite (libSQL). A local file in development and a file on a persistent Railway volume in production. A hosted libSQL database such as Turso also works, with no code changes.

## Run locally

Requires **Node.js 22** (20.9+ also works).

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are needed locally: the app creates `./local.db` (SQLite) on first request, seeds the demo accounts and documents, and uses a development-only session secret. To reset, stop the server and delete `local.db`.

### Tests and checks

```bash
npm test            # Vitest: services, access control, concurrency, import, sessions (real SQLite)
npm run typecheck   # generate Next route types + tsc
npm run lint
npm run build
```

## Deployment (Railway)

The app runs as a single Railway service: one Node process (`next start`) with its SQLite database file on a persistent **Railway volume**. There is no external database to sign up for.

1. **Create the service.** In Railway: **New Project → Deploy from GitHub repo** → choose this repository. Railway detects Next.js, runs `npm ci` and `npm run build`, and starts the app with `npm start`.
2. **Attach a volume.** Right-click the service → **Attach volume** and set the mount path to `/data`. The app stores its database at `<mount path>/colabdocs.db` automatically, using the `RAILWAY_VOLUME_MOUNT_PATH` variable that Railway sets. Without a volume the app refuses to serve requests in production.
3. **Set one variable.** In **Variables**, add `SESSION_SECRET` with a long random string, e.g. the output of `openssl rand -base64 32`.
4. **Add the health check.** In **Settings → Deploy → Healthcheck Path**, enter `/api/health`. Railway no longer applies [`railway.json`](railway.json) to new services, so set this by hand; without it a misconfigured deploy still shows as "Online".
5. **Expose it.** In **Settings → Networking**, click **Generate Domain** (port 8080).

On the first request the app creates the schema and seeds the demo accounts and documents. This is idempotent: it seeds once per database and never re-creates documents a user deletes.

Operational notes:

- **Health check:** `GET /api/health` returns 200 only when `SESSION_SECRET` is set and the database answers. A misconfigured deploy fails visibly instead of going live broken. In production the app also refuses to fall back to the container's own disk, which would lose every document on redeploy.
- **One replica.** A SQLite file supports one writer process, so keep the service at one instance. Railway briefly stops the old deployment before starting a new one when a volume is attached, so expect a few seconds of downtime per deploy.
- **Alternative database:** set `DATABASE_URL` (plus `DATABASE_AUTH_TOKEN`) to any hosted libSQL database, such as [Turso](https://turso.tech). This works on any host, including serverless ones, with no code changes. `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` are also accepted.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes (production) | Signs session cookies |
| `DATABASE_URL` | no on Railway with a volume | Overrides the database location (`file:/path/app.db` or `libsql://…`) |
| `DATABASE_AUTH_TOKEN` | only for hosted libSQL | Auth token for `DATABASE_URL` |

## Project structure

```
src/
  app/
    page.tsx                  Home: My documents / Shared with me, new + import
    login/                    Demo account picker
    docs/[id]/                Editor page (server loads doc + role, client edits)
    api/
      session/                POST sign in, DELETE sign out
      health/                 GET deploy health check (config + database)
      documents/              GET list, POST create
      documents/import/       POST multipart file → new document
      documents/[id]/         GET, PATCH (versioned save), DELETE
      documents/[id]/shares/  GET people with access, POST grant/change role
      documents/[id]/shares/[userId]/  DELETE revoke
  components/
    editor/                   DocumentEditor (save loop, conflicts), Toolbar, ShareDialog, ExportMenu
  lib/
    access.ts                 Roles and capabilities (owner / editor / viewer)
    documents.ts              Document + sharing service; all access checks live here
    db.ts                     libSQL client, database location, schema, seed data
    session.ts                HMAC-signed session cookie
    importers.ts              .txt / .md / .docx → sanitized HTML
    sanitize.ts               HTML allowlist applied to every write
    api.ts, errors.ts         Typed errors → consistent JSON error responses
tests/                        Vitest suites (run against a temporary SQLite file)
samples/                      Files for trying the importer
```

## More

- [ARCHITECTURE.md](ARCHITECTURE.md): what I prioritized, the trade-offs, and what's next.
- [AI_WORKFLOW.md](AI_WORKFLOW.md): how AI tools were used and checked.
