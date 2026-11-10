import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { getUser, type UserRef } from "./documents";
import { unauthorized } from "./errors";

/**
 * Simulated auth: the visitor picks a seeded demo account and we store its id
 * in an HMAC-signed, httpOnly cookie. There are no passwords, but the cookie
 * can't be forged or edited to impersonate another user without the secret.
 */

export const SESSION_COOKIE = "colabdocs_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production. See README → Deployment.");
  }
  return "dev-only-insecure-session-secret";
}

const mac = (userId: string) => createHmac("sha256", secret()).update(userId).digest("base64url");

export function signSession(userId: string): string {
  return `${userId}.${mac(userId)}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(userId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}

export async function getCurrentUser(): Promise<UserRef | null> {
  const userId = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return getUser(await getDb(), userId);
}

export async function requireUser(): Promise<UserRef> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function startSession(userId: string) {
  (await cookies()).set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax", // cross-site POSTs don't carry the cookie (basic CSRF guard)
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
