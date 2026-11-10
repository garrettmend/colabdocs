import type { Client, Row } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { can, SHARE_ROLES, type Role, type ShareRole } from "./access";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { htmlToPreview, sanitizeDocumentHtml } from "./sanitize";

/**
 * Document + sharing service. Every function takes the acting user's id and
 * enforces access itself, so route handlers stay thin and the rules are
 * covered by tests that run against a real SQLite database.
 */

export const TITLE_MAX = 200;
export const CONTENT_MAX_CHARS = 1_000_000;
export const DEFAULT_TITLE = "Untitled document";

export type UserRef = { id: string; name: string; email: string; color: string };

export type DocumentSummary = {
  id: string;
  title: string;
  preview: string;
  role: Role;
  owner: UserRef;
  version: number;
  updatedAt: string;
  updatedBy: UserRef | null;
};

export type DocumentDetail = DocumentSummary & { content: string };

export type Share = { user: UserRef; role: ShareRole; createdAt: string };

// ---------------------------------------------------------------- validation

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title can't be empty.")
  .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer.`);

const contentSchema = z
  .string()
  .max(CONTENT_MAX_CHARS, "Document is too large to save.");

export const createInput = z.object({
  title: titleSchema.optional(),
  content: contentSchema.optional(),
});

export const updateInput = z
  .object({
    title: titleSchema.optional(),
    content: contentSchema.optional(),
    version: z.number().int().positive(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: "Nothing to update.",
  });

export const shareInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.enum(SHARE_ROLES as [ShareRole, ...ShareRole[]], {
    message: "Role must be 'editor' or 'viewer'.",
  }),
});

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw badRequest(first?.message ?? "Invalid request.", {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

// ------------------------------------------------------------------- helpers

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function userFrom(row: Row, prefix: string): UserRef | null {
  if (row[`${prefix}_id`] == null) return null;
  return {
    id: str(row[`${prefix}_id`]),
    name: str(row[`${prefix}_name`]),
    email: str(row[`${prefix}_email`]),
    color: str(row[`${prefix}_color`]),
  };
}

const DOC_SELECT = `
  SELECT d.id, d.title, d.version, d.updated_at,
         o.id  AS owner_id, o.name  AS owner_name, o.email  AS owner_email, o.color  AS owner_color,
         ub.id AS ub_id,    ub.name AS ub_name,    ub.email AS ub_email,    ub.color AS ub_color,
         CASE WHEN d.owner_id = ?1 THEN 'owner' ELSE s.role END AS role`;

const DOC_FROM = `
  FROM documents d
  JOIN users o ON o.id = d.owner_id
  LEFT JOIN users ub ON ub.id = d.updated_by
  LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?1`;

function summaryFrom(row: Row, contentForPreview: string): DocumentSummary {
  const title = str(row.title);
  let preview = htmlToPreview(contentForPreview);
  // Docs often open with a heading that repeats the title; don't show it twice.
  if (preview.toLowerCase().startsWith(title.toLowerCase())) preview = preview.slice(title.length).trim();
  return {
    id: str(row.id),
    title,
    preview,
    role: str(row.role) as Role,
    owner: userFrom(row, "owner")!,
    version: Number(row.version),
    updatedAt: str(row.updated_at),
    updatedBy: userFrom(row, "ub"),
  };
}

export async function getRole(db: Client, docId: string, userId: string): Promise<Role | null> {
  const { rows } = await db.execute({
    sql: `SELECT d.owner_id, s.role
          FROM documents d
          LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?
          WHERE d.id = ?`,
    args: [userId, docId],
  });
  const row = rows[0];
  if (!row) return null;
  if (row.owner_id === userId) return "owner";
  return (row.role as ShareRole | null) ?? null;
}

async function requireRole(db: Client, docId: string, userId: string): Promise<Role> {
  const role = await getRole(db, docId, userId);
  if (!can.view(role)) throw notFound();
  return role;
}

// --------------------------------------------------------------------- users

export async function listUsers(db: Client): Promise<UserRef[]> {
  const { rows } = await db.execute("SELECT id, name, email, color FROM users ORDER BY name");
  return rows.map((r) => ({ id: str(r.id), name: str(r.name), email: str(r.email), color: str(r.color) }));
}

export async function getUser(db: Client, userId: string): Promise<UserRef | null> {
  const { rows } = await db.execute({
    sql: "SELECT id, name, email, color FROM users WHERE id = ?",
    args: [userId],
  });
  const r = rows[0];
  return r ? { id: str(r.id), name: str(r.name), email: str(r.email), color: str(r.color) } : null;
}

// ----------------------------------------------------------------- documents

export async function listDocuments(
  db: Client,
  userId: string,
): Promise<{ owned: DocumentSummary[]; shared: DocumentSummary[] }> {
  const { rows } = await db.execute({
    sql: `${DOC_SELECT}, substr(d.content, 1, 2000) AS content_head
          ${DOC_FROM}
          WHERE d.owner_id = ?1 OR s.user_id IS NOT NULL
          ORDER BY d.updated_at DESC`,
    args: [userId],
  });
  const docs = rows.map((r) => summaryFrom(r, str(r.content_head)));
  return {
    owned: docs.filter((d) => d.role === "owner"),
    shared: docs.filter((d) => d.role !== "owner"),
  };
}

export async function getDocument(db: Client, docId: string, userId: string): Promise<DocumentDetail> {
  const { rows } = await db.execute({
    sql: `${DOC_SELECT}, d.content ${DOC_FROM} WHERE d.id = ?2`,
    args: [userId, docId],
  });
  const row = rows[0];
  // No role means the document exists but isn't shared with this user.
  if (!row || row.role == null) throw notFound();
  const content = str(row.content);
  return { ...summaryFrom(row, content), content };
}

export async function createDocument(
  db: Client,
  userId: string,
  input: unknown = {},
): Promise<DocumentDetail> {
  const { title, content } = parseInput(createInput, input);
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO documents (id, owner_id, title, content, version, created_at, updated_at, updated_by)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    args: [id, userId, title ?? DEFAULT_TITLE, sanitizeDocumentHtml(content ?? ""), now, now, userId],
  });
  return getDocument(db, id, userId);
}

/**
 * Save title and/or content using optimistic concurrency: the client sends the
 * version it last loaded, and the write only applies if nobody saved since.
 * Otherwise it fails with 409 so the user can choose which version to keep,
 * instead of silently overwriting a collaborator's work.
 */
export async function updateDocument(
  db: Client,
  docId: string,
  userId: string,
  input: unknown,
): Promise<DocumentSummary> {
  const { title, content, version } = parseInput(updateInput, input);
  const role = await requireRole(db, docId, userId);
  if (!can.edit(role)) throw forbidden("You have view-only access to this document.");

  // Numbered placeholders (?1…) behave identically in the local and hosted drivers.
  const sets = ["version = version + 1", "updated_at = ?1", "updated_by = ?2"];
  const args: (string | number)[] = [new Date().toISOString(), userId, docId, version];
  if (title !== undefined) {
    args.push(title);
    sets.push(`title = ?${args.length}`);
  }
  if (content !== undefined) {
    args.push(sanitizeDocumentHtml(content));
    sets.push(`content = ?${args.length}`);
  }

  const result = await db.execute({
    sql: `UPDATE documents SET ${sets.join(", ")} WHERE id = ?3 AND version = ?4`,
    args,
  });

  if (result.rowsAffected === 0) {
    const current = await getDocument(db, docId, userId);
    const who = current.updatedBy?.id === userId ? "you (in another tab)" : current.updatedBy?.name ?? "someone else";
    throw conflict(`This document was changed by ${who} after you opened it.`, {
      currentVersion: current.version,
      updatedAt: current.updatedAt,
      updatedBy: current.updatedBy,
    });
  }

  const updated: Partial<DocumentDetail> = await getDocument(db, docId, userId);
  delete updated.content; // saves don't need the body echoed back
  return updated as DocumentSummary;
}

export async function deleteDocument(db: Client, docId: string, userId: string): Promise<void> {
  const role = await requireRole(db, docId, userId);
  if (!can.delete(role)) throw forbidden("Only the owner can delete this document.");
  await db.batch(
    [
      { sql: "DELETE FROM document_shares WHERE document_id = ?", args: [docId] },
      { sql: "DELETE FROM documents WHERE id = ?", args: [docId] },
    ],
    "write",
  );
}

// ------------------------------------------------------------------- sharing

export async function listShares(
  db: Client,
  docId: string,
  userId: string,
): Promise<{ owner: UserRef; shares: Share[] }> {
  const doc = await getDocument(db, docId, userId);
  const { rows } = await db.execute({
    sql: `SELECT s.role, s.created_at, u.id, u.name, u.email, u.color
          FROM document_shares s JOIN users u ON u.id = s.user_id
          WHERE s.document_id = ?
          ORDER BY s.created_at`,
    args: [docId],
  });
  return {
    owner: doc.owner,
    shares: rows.map((r) => ({
      user: { id: str(r.id), name: str(r.name), email: str(r.email), color: str(r.color) },
      role: str(r.role) as ShareRole,
      createdAt: str(r.created_at),
    })),
  };
}

export async function shareDocument(
  db: Client,
  docId: string,
  userId: string,
  input: unknown,
): Promise<Share> {
  const role = await requireRole(db, docId, userId);
  if (!can.share(role)) throw forbidden("Only the owner can change who has access.");
  const { email, role: shareRole } = parseInput(shareInput, input);

  const { rows } = await db.execute({
    sql: "SELECT id, name, email, color FROM users WHERE email = ?",
    args: [email],
  });
  const target = rows[0];
  if (!target) {
    const known = (await listUsers(db)).map((u) => u.email).join(", ");
    throw badRequest(`No account uses ${email}. Demo accounts: ${known}.`);
  }
  if (target.id === userId) throw badRequest("You already own this document.");

  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    args: [docId, str(target.id), shareRole, now],
  });

  return {
    user: { id: str(target.id), name: str(target.name), email: str(target.email), color: str(target.color) },
    role: shareRole,
    createdAt: now,
  };
}

export async function revokeShare(
  db: Client,
  docId: string,
  userId: string,
  targetUserId: string,
): Promise<void> {
  const role = await requireRole(db, docId, userId);
  if (!can.share(role)) throw forbidden("Only the owner can change who has access.");
  await db.execute({
    sql: "DELETE FROM document_shares WHERE document_id = ? AND user_id = ?",
    args: [docId, targetUserId],
  });
}
