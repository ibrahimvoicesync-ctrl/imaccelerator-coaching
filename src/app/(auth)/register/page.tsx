import Link from "next/link";
import { XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { MagicLinkCard } from "./MagicLinkCard";

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

export default async function RegisterMagicPage({
  searchParams,
}: {
  searchParams: Promise<{ magic?: string; error?: string }>;
}) {
  const { magic, error } = await searchParams;

  if (!magic) {
    return (
      <ErrorCard
        heading="No Magic Link Provided"
        message="No magic link was found. Please use the link your coach sent you, or go back to login."
      />
    );
  }

  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(magic)) {
    return (
      <ErrorCard
        heading="Invalid Link"
        message="This link has expired or is no longer valid. Ask for a new one."
      />
    );
  }

  const admin = createAdminClient();
  const { data: magicLink } = await admin
    .from("magic_links")
    .select("id, code, role, expires_at, max_uses, use_count, is_active")
    .eq("code", magic)
    .single();

  if (!magicLink || !magicLink.is_active) {
    return (
      <ErrorCard
        heading="Link Not Valid"
        message="This link has expired or is no longer valid. Ask for a new one."
      />
    );
  }

  if (magicLink.expires_at && new Date(magicLink.expires_at) < new Date()) {
    return (
      <ErrorCard
        heading="Link Expired"
        message="This link has expired or is no longer valid. Ask for a new one."
      />
    );
  }

  if (
    magicLink.max_uses !== null &&
    magicLink.use_count >= magicLink.max_uses
  ) {
    return (
      <ErrorCard
        heading="Link No Longer Available"
        message="This link has expired or is no longer valid. Ask for a new one."
      />
    );
  }

  return (
    <MagicLinkCard
      magicLink={{ code: magicLink.code, role: magicLink.role }}
      error={error}
    />
  );
}
