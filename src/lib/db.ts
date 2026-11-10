import type { Client } from "@libsql/client";

/**
 * Storage: SQLite via libSQL.
 *  - Local dev / tests: a file (`file:local.db`) — zero setup.
 *  - Production on Railway: a file on a persistent volume.
 *  - Or any hosted libSQL database (e.g. Turso) over HTTP, by setting DATABASE_URL.
 * Same SQL dialect and client API everywhere, so there is one code path.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id, updated_at);

CREATE TABLE IF NOT EXISTS document_shares (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export type SeedUser = { id: string; email: string; name: string; color: string };

/** Demo accounts. Auth is simulated: visitors pick one on the sign-in page. */
export const SEED_USERS: SeedUser[] = [
  { id: "u_alice", email: "alice@colabdocs.test", name: "Alice Chen", color: "#2563eb" },
  { id: "u_bob", email: "bob@colabdocs.test", name: "Bob Rivera", color: "#16a34a" },
  { id: "u_carol", email: "carol@colabdocs.test", name: "Carol Okafor", color: "#c026d3" },
];

const WELCOME_HTML = `
<h1>Welcome to ColabDocs</h1>
<p>This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> (can edit) and <strong>Carol</strong> (can view). Switch accounts from the avatar menu to see how access changes.</p>
<h2>What you can try</h2>
<ul>
  <li><p>Format text with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, headings and lists.</p></li>
  <li><p>Rename a document by editing its title — changes save automatically.</p></li>
  <li><p>Import a <code>.txt</code>, <code>.md</code> or <code>.docx</code> file from the home page.</p></li>
  <li><p>Share a document with another demo account as an editor or a viewer.</p></li>
</ul>
<h2>Good to know</h2>
<ol>
  <li><p>Editing is not real-time. If two people save over each other, the second save is stopped and they choose which version to keep.</p></li>
  <li><p>Viewers get a read-only editor; only the owner can share or delete.</p></li>
</ol>
<blockquote><p>Tip: press Ctrl/⌘ + S to save immediately.</p></blockquote>
`;

const PLANNING_HTML = `
<h1>Q4 planning notes</h1>
<p>Owned by <strong>Bob</strong>. Alice has view-only access, so she can read but not edit this one.</p>
<h2>Priorities</h2>
<ol>
  <li><p>Ship the onboarding checklist</p></li>
  <li><p>Reduce time-to-first-document</p></li>
  <li><p>Pilot sharing with two internal teams</p></li>
</ol>
<h2>Open questions</h2>
<ul>
  <li><p>Do we need comments before suggestion mode?</p></li>
  <li><p>Which file types matter most for import?</p></li>
</ul>
`;

async function seed(client: Client, demoContent: boolean) {
  const now = new Date().toISOString();

  await client.batch(
    SEED_USERS.map((u) => ({
      sql: "INSERT OR IGNORE INTO users (id, email, name, color) VALUES (?, ?, ?, ?)",
      args: [u.id, u.email, u.name, u.color],
    })),
    "write",
  );
  if (!demoContent) return;

  // Seed demo documents exactly once per database, even if several server
  // instances cold-start at the same time, and never re-create them after a
  // user deletes them.
  const claimed = await client.execute({
    sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded_at', ?)",
    args: [now],
  });
  if (claimed.rowsAffected !== 1) return;

  await client.batch(
    [
      {
        sql: `INSERT INTO documents (id, owner_id, title, content, version, created_at, updated_at, updated_by)
              VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
        args: ["d_welcome", "u_alice", "Welcome to ColabDocs", WELCOME_HTML.trim(), now, now, "u_alice"],
      },
      {
        sql: `INSERT INTO documents (id, owner_id, title, content, version, created_at, updated_at, updated_by)
              VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
        args: ["d_planning", "u_bob", "Q4 planning notes", PLANNING_HTML.trim(), now, now, "u_bob"],
      },
      {
        sql: "INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
        args: ["d_welcome", "u_bob", "editor", now],
      },
      {
        sql: "INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
        args: ["d_welcome", "u_carol", "viewer", now],
      },
      {
        sql: "INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
        args: ["d_planning", "u_alice", "viewer", now],
      },
    ],
    "write",
  );
}

/** Open a database, apply the (idempotent) schema and seed data. */
export async function openDatabase(
  url: string,
  authToken?: string,
  options: { demoContent?: boolean } = {},
): Promise<Client> {
  const isLocal = url.startsWith("file:") || url === ":memory:";
  // Remote databases use the HTTP-only build of the client (no native
  // dependency); the full build with the SQLite engine is only needed for files.
  const { createClient } = isLocal
    ? await import("@libsql/client")
    : await import("@libsql/client/web");

  const client = createClient({ url, authToken });
  await client.executeMultiple(SCHEMA);
  await seed(client, options.demoContent !== false);
  return client;
}

/**
 * Where the database lives, in order of precedence:
 *  1. DATABASE_URL (or TURSO_DATABASE_URL): any libSQL URL, e.g. file:/data/app.db or libsql://…
 *  2. A Railway volume, if one is attached (Railway sets RAILWAY_VOLUME_MOUNT_PATH).
 *  3. ./local.db in development. In production, refuse to guess: an ephemeral
 *     container disk would silently lose every document on redeploy.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.DATABASE_URL ?? env.TURSO_DATABASE_URL;
  if (explicit) return explicit;
  if (env.RAILWAY_VOLUME_MOUNT_PATH) {
    return `file:${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/+$/, "")}/colabdocs.db`;
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "No database configured. Attach a Railway volume or set DATABASE_URL. See README → Deployment.",
    );
  }
  return "file:local.db";
}

const globalForDb = globalThis as unknown as { __colabdocsDb?: Promise<Client> };

/** Process-wide database handle (survives dev hot reloads). */
export function getDb(): Promise<Client> {
  if (!globalForDb.__colabdocsDb) {
    const url = resolveDatabaseUrl();
    const authToken = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

    globalForDb.__colabdocsDb = openDatabase(url, authToken).catch((err) => {
      globalForDb.__colabdocsDb = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return globalForDb.__colabdocsDb;
}
