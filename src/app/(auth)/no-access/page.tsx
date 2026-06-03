import Link from "next/link";
import { ShieldX } from "lucide-react";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ima-bg px-4">
      <div className="w-full max-w-md rounded-xl bg-ima-surface p-8 shadow-sm border border-ima-border text-center">
        <ShieldX
          className="mx-auto h-12 w-12 text-ima-text-muted"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ima-text">
          Access Required
        </h1>
        <p className="mt-3 text-ima-text-secondary">
          IMA Accelerator is invite-only. To join, ask your coach or Abu Lahya
          for an invite link.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-6 rounded-lg bg-ima-primary text-white font-medium hover:bg-ima-primary-hover motion-safe:transition-colors"
        >
          Back to Login
        </Link>
      </div>
    </main>
  );
}
