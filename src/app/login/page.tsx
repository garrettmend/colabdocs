import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { listUsers } from "@/lib/documents";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { AccountPicker } from "./AccountPicker";

export const metadata: Metadata = { title: "Sign in" };
// Reads the database and session cookie, so it must render per request.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [users, current] = await Promise.all([getDb().then(listUsers), getCurrentUser()]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Choose a demo account</h1>
          <p className="mt-1 text-sm text-muted">
            Sign-in is simulated for this prototype — no passwords. Switch between accounts to try sharing.
          </p>
          <AccountPicker users={users} currentUserId={current?.id ?? null} />
        </div>
      </div>
    </main>
  );
}
