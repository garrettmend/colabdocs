import { beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listShares,
  revokeShare,
  shareDocument,
  updateDocument,
} from "@/lib/documents";
import { ALICE, BOB, CAROL, expectAppError, freshDb } from "./helpers";

let db: Client;
beforeEach(async () => {
  db = await freshDb();
});

describe("documents: create, save, reopen", () => {
  it("persists title and rich-text structure across reopen", async () => {
    const doc = await createDocument(db, ALICE, {});
    expect(doc.title).toBe("Untitled document");
    expect(doc.role).toBe("owner");
    expect(doc.version).toBe(1);

    const html = "<h2>Plan</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ol><li><p>one</p></li></ol>";
    const saved = await updateDocument(db, doc.id, ALICE, { title: "Roadmap", content: html, version: 1 });
    expect(saved.version).toBe(2);

    const reopened = await getDocument(db, doc.id, ALICE);
    expect(reopened.title).toBe("Roadmap");
    expect(reopened.content).toBe(html);
    expect(reopened.updatedBy?.id).toBe(ALICE);
  });

  it("validates input", async () => {
    const doc = await createDocument(db, ALICE, {});
    await expectAppError(updateDocument(db, doc.id, ALICE, { title: "   ", version: 1 }), 400, /empty/);
    await expectAppError(updateDocument(db, doc.id, ALICE, { title: "x".repeat(201), version: 1 }), 400);
    await expectAppError(updateDocument(db, doc.id, ALICE, { version: 1 }), 400, /Nothing to update/);
    await expectAppError(updateDocument(db, doc.id, ALICE, { title: "ok" }), 400);
  });

  it("sanitizes stored HTML (no scripts, handlers or javascript: links)", async () => {
    const doc = await createDocument(db, ALICE, {});
    await updateDocument(db, doc.id, ALICE, {
      version: 1,
      content: `<p onclick="steal()">Hi<script>alert(1)</script> <a href="javascript:alert(1)">x</a> <img src=x onerror=alert(1)></p>`,
    });
    const { content } = await getDocument(db, doc.id, ALICE);
    expect(content).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(content).toContain("Hi");
  });
});

describe("optimistic concurrency", () => {
  it("rejects a save based on a stale version instead of overwriting", async () => {
    const doc = await createDocument(db, ALICE, { content: "<p>v1</p>" });
    await shareDocument(db, doc.id, ALICE, { email: "bob@colabdocs.test", role: "editor" });

    // Both open version 1. Bob saves first.
    await updateDocument(db, doc.id, BOB, { content: "<p>Bob's edit</p>", version: 1 });

    const err = await expectAppError(
      updateDocument(db, doc.id, ALICE, { content: "<p>Alice's edit</p>", version: 1 }),
      409,
      /Bob Rivera/,
    );
    expect(err.details?.currentVersion).toBe(2);
    expect((await getDocument(db, doc.id, ALICE)).content).toBe("<p>Bob's edit</p>");

    // Retrying against the current version succeeds ("Keep mine").
    const saved = await updateDocument(db, doc.id, ALICE, { content: "<p>Alice's edit</p>", version: 2 });
    expect(saved.version).toBe(3);
  });
});

describe("sharing and access control", () => {
  it("separates owned and shared documents per user", async () => {
    const doc = await createDocument(db, ALICE, { title: "Spec" });
    await shareDocument(db, doc.id, ALICE, { email: "BOB@colabdocs.test ", role: "viewer" });

    const alice = await listDocuments(db, ALICE);
    expect(alice.owned.map((d) => d.title)).toEqual(["Spec"]);
    expect(alice.shared).toEqual([]);

    const bob = await listDocuments(db, BOB);
    expect(bob.owned).toEqual([]);
    expect(bob.shared).toMatchObject([{ title: "Spec", role: "viewer", owner: { id: ALICE } }]);

    const carol = await listDocuments(db, CAROL);
    expect(carol.owned).toEqual([]);
    expect(carol.shared).toEqual([]);
  });

  it("enforces viewer / editor / owner capabilities", async () => {
    const doc = await createDocument(db, ALICE, {});
    await shareDocument(db, doc.id, ALICE, { email: "bob@colabdocs.test", role: "editor" });
    await shareDocument(db, doc.id, ALICE, { email: "carol@colabdocs.test", role: "viewer" });

    // Viewer can read but not write, share or delete.
    expect((await getDocument(db, doc.id, CAROL)).role).toBe("viewer");
    await expectAppError(updateDocument(db, doc.id, CAROL, { title: "hijack", version: 1 }), 403);
    await expectAppError(shareDocument(db, doc.id, CAROL, { email: "bob@colabdocs.test", role: "editor" }), 403);
    await expectAppError(deleteDocument(db, doc.id, CAROL), 403);

    // Editor can write but not share, revoke or delete.
    await updateDocument(db, doc.id, BOB, { title: "Edited by Bob", version: 1 });
    await expectAppError(shareDocument(db, doc.id, BOB, { email: "carol@colabdocs.test", role: "editor" }), 403);
    await expectAppError(revokeShare(db, doc.id, BOB, CAROL), 403);
    await expectAppError(deleteDocument(db, doc.id, BOB), 403);
  });

  it("hides documents from users without access (404, not 403)", async () => {
    const doc = await createDocument(db, ALICE, {});
    await expectAppError(getDocument(db, doc.id, CAROL), 404);
    await expectAppError(updateDocument(db, doc.id, CAROL, { title: "x", version: 1 }), 404);
    await expectAppError(listShares(db, doc.id, CAROL), 404);
    await expectAppError(deleteDocument(db, doc.id, CAROL), 404);
  });

  it("changes roles in place and revokes access", async () => {
    const doc = await createDocument(db, ALICE, {});
    await shareDocument(db, doc.id, ALICE, { email: "bob@colabdocs.test", role: "viewer" });
    await shareDocument(db, doc.id, ALICE, { email: "bob@colabdocs.test", role: "editor" });

    const { shares } = await listShares(db, doc.id, ALICE);
    expect(shares).toHaveLength(1);
    expect(shares[0]).toMatchObject({ role: "editor", user: { id: BOB } });

    await revokeShare(db, doc.id, ALICE, BOB);
    await expectAppError(getDocument(db, doc.id, BOB), 404);
    expect((await listDocuments(db, BOB)).shared).toEqual([]);
  });

  it("rejects invalid share requests", async () => {
    const doc = await createDocument(db, ALICE, {});
    await expectAppError(shareDocument(db, doc.id, ALICE, { email: "nobody@colabdocs.test", role: "editor" }), 400, /No account/);
    await expectAppError(shareDocument(db, doc.id, ALICE, { email: "alice@colabdocs.test", role: "editor" }), 400, /already own/);
    await expectAppError(shareDocument(db, doc.id, ALICE, { email: "not-an-email", role: "editor" }), 400);
    await expectAppError(shareDocument(db, doc.id, ALICE, { email: "bob@colabdocs.test", role: "owner" }), 400);
  });

  it("deleting a document removes it for collaborators too", async () => {
    const doc = await createDocument(db, ALICE, {});
    await shareDocument(db, doc.id, ALICE, { email: "bob@colabdocs.test", role: "editor" });
    await deleteDocument(db, doc.id, ALICE);

    await expectAppError(getDocument(db, doc.id, ALICE), 404);
    expect((await listDocuments(db, BOB)).shared).toEqual([]);
    const orphans = await db.execute({ sql: "SELECT COUNT(*) AS n FROM document_shares WHERE document_id = ?", args: [doc.id] });
    expect(Number(orphans.rows[0]!.n)).toBe(0);
  });
});
