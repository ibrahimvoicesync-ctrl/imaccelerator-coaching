import Link from "next/link";
import { XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { RegisterCard } from "./RegisterCard";

interface ErrorCardProps {
  heading: string;
  message: string;
}

function ErrorCard({ heading, message }: ErrorCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ima-bg px-4">
      <div className="w-full max-w-md rounded-[14px] bg-ima-surface p-8 shadow-card border border-ima-border text-center">
        <XCircle
          className="mx-auto h-12 w-12 text-ima-error"
          aria-hidden="true"
        />
        <h1 className="mt-4 text-xl font-bold text-ima-text">{heading}</h1>
        <p className="mt-3 text-ima-text-secondary text-sm">{message}</p>
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

export default async function RegisterInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;

  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(code)) {
    return (
      <ErrorCard
        heading="Invalid Invite Link"
        message="This invite link is not valid. Please check your URL or ask your coach for a new one."
      />
    );
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invites")
    .select("id, email, role, code, used, expires_at")
    .eq("code", code)
    .single();

  if (!invite) {
    return (
      <ErrorCard
        heading="Invite Not Found"
        message="This invite link is not valid. Please check your URL or ask your coach for a new one."
      />
    );
  }

  if (invite.used) {
    return (
      <ErrorCard
        heading="Invite Already Used"
        message="This invite has already been used. If you already registered, try signing in from the login page."
      />
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <ErrorCard
        heading="Invite Expired"
        message="This invite has expired. Ask your coach for a new one."
      />
    );
  }

  return (
    <RegisterCard
      invite={{ code: invite.code, role: invite.role, email: invite.email }}
      error={error}
    />
  );
}
