import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { openDatabase } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const ALICE = "u_alice";
export const BOB = "u_bob";
export const CAROL = "u_carol";

/** A fresh SQLite file per test: real SQL, real constraints, no shared state. */
export async function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "colabdocs-test-"));
  const file = join(dir, "test.db").replace(/\\/g, "/");
  return openDatabase(`file:${file}`, undefined, { demoContent: false });
}

/** Assert that a promise rejects with an AppError of the given HTTP status. */
export async function expectAppError(promise: Promise<unknown>, status: number, message?: RegExp) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected an AppError ${status}`).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
  if (message) expect((err as AppError).message).toMatch(message);
  return err as AppError;
}
