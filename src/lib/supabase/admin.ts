import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

let _adminClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Server-only Supabase client with service role key.
 * Bypasses RLS — use only in server API routes and server components
 * for admin operations like profile lookups during auth callbacks.
 *
 * Module-level singleton: instantiated once per process, not once per request.
 * Safe for service_role (stateless — no cookies, no session).
 * Do NOT apply this pattern to createServerClient() (request-scoped cookies).
 *
 * Talks to Supabase over SUPABASE_INTERNAL_URL (the local gateway on this box)
 * when set, so the service key never travels through the public edge — the
 * edge (Traefik) rejects service keys from outside this machine.
 */
export function createAdminClient() {
  if (!_adminClient) {
    _adminClient = createClient<Database>(
      process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return _adminClient;
}
