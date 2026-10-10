import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { ROLE_REDIRECTS, ROADMAP_STEPS, VALIDATION, APP_CONFIG, type Role } from "@/lib/config";

// Hosts we will honor when deriving the redirect origin from client-supplied
// forwarded headers. x-forwarded-host is attacker-controllable, so anything not
// on this list falls back to the pinned default — otherwise it's an
// open-redirect / OAuth-code-phishing vector.
const ALLOWED_REDIRECT_HOSTS = new Set([
  new URL(APP_CONFIG.url).host,
  "localhost",
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
]);

function getAppOrigin(request: Request): string {
  // 1. Pinned origin via env var always wins (prod + configured dev).
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
  }
  // 2. Derive from forwarded headers ONLY when the host is allow-listed.
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost && ALLOWED_REDIRECT_HOSTS.has(forwardedHost)) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  // 3. Fall back to the request's own origin if allow-listed, else the pinned default.
  if (ALLOWED_REDIRECT_HOSTS.has(new URL(request.url).host)) {
    return new URL(request.url).origin;
  }
  return new URL(APP_CONFIG.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getAppOrigin(request);
  const code = searchParams.get("code");
  const inviteCode = searchParams.get("invite_code");
  const magicCode = searchParams.get("magic_code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[auth callback] Failed to exchange code for session:", exchangeError);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const admin = createAdminClient();

  // Check if user already has a profile by auth_id (returning user)
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .single();

  if (profile && Object.keys(ROLE_REDIRECTS).includes(profile.role)) {
    // Returning user — redirect to their role dashboard
    // No last_active_at update needed: updated_at is auto-updated by DB trigger
    const dest = ROLE_REDIRECTS[profile.role as Role];
    return NextResponse.redirect(`${origin}${dest}`);
  }

  // No match by auth_id — ensure we have an email before proceeding
  if (!user.email) {
    if (inviteCode) {
      return NextResponse.redirect(`${origin}/register/${inviteCode}?error=auth_failed`);
    }
    if (magicCode) {
      return NextResponse.redirect(`${origin}/register?magic=${magicCode}&error=auth_failed`);
    }
    return NextResponse.redirect(`${origin}/no-access`);
  }

  // Try matching by email and link the auth_id (pre-created profile with no auth_id)
  const { data: emailProfile } = await admin
    .from("users")
    .select("id, role")
    .eq("email", user.email)
    .is("auth_id", null)
    .single();

  if (emailProfile && Object.keys(ROLE_REDIRECTS).includes(emailProfile.role)) {
    const { error: updateError } = await admin
      .from("users")
      .update({ auth_id: user.id })
      .eq("id", emailProfile.id);

    if (updateError) {
      console.error("[auth callback] Failed to link auth_id:", updateError);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    const dest = ROLE_REDIRECTS[emailProfile.role as Role];
    return NextResponse.redirect(`${origin}${dest}`);
  }

  // No profile exists — handle invite registration
  if (inviteCode) {
    const { data: invite } = await admin
      .from("invites")
      .select("id, email, role, coach_id, used, expires_at")
      .eq("code", inviteCode)
      .single();

    if (!invite || invite.used || new Date(invite.expires_at) < new Date()) {
      return NextResponse.redirect(`${origin}/register/${inviteCode}?error=invalid_invite`);
    }

    // Compare emails case-insensitively
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.redirect(`${origin}/register/${inviteCode}?error=email_mismatch`);
    }

    // Validate invite role
    const validRoles = Object.keys(ROLE_REDIRECTS);
    if (!validRoles.includes(invite.role)) {
      console.error("[auth callback] Invalid invite role:", invite.role);
      return NextResponse.redirect(`${origin}/register/${inviteCode}?error=invalid_invite`);
    }

    // Atomically mark invite as used (prevents race condition)
    const { data: consumed } = await admin
      .from("invites")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("used", false)
      .select("id")
      .single();

    if (!consumed) {
      return NextResponse.redirect(`${origin}/register/${inviteCode}?error=already_used`);
    }

    // Extract and truncate user name
    const rawName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email.split("@")[0];
    const userName =
      typeof rawName === "string"
        ? rawName.slice(0, VALIDATION.name.max)
        : user.email.split("@")[0];

    // Create user profile
    const { data: newUser, error: insertError } = await admin
      .from("users")
      .insert({
        auth_id: user.id,
        email: user.email,
        name: userName,
        role: invite.role as Role,
        coach_id: invite.coach_id,
      })
      .select("id")
      .single();

    if (insertError || !newUser) {
      console.error("[auth callback] Failed to create user via invite:", insertError);
      // Rollback invite consumption
      const { error: rollbackError } = await admin
        .from("invites")
        .update({ used: false, used_at: null })
        .eq("id", invite.id);
      if (rollbackError) {
        console.error(
          "[auth callback] CRITICAL: Failed to rollback invite consumption for invite",
          invite.id,
          rollbackError
        );
      }
      return NextResponse.redirect(`${origin}/register/${inviteCode}?error=auth_failed`);
    }

    // If student or student_diy, seed roadmap progress
    if (invite.role === "student" || invite.role === "student_diy") {
      const roadmapRows = ROADMAP_STEPS.map((step) => ({
        student_id: newUser.id,
        step_number: step.step,
        step_name: step.title,
        status:
          step.step === 1
            ? ("completed" as const)
            : step.step === 2
              ? ("active" as const)
              : ("locked" as const),
        completed_at: step.step === 1 ? new Date().toISOString() : null,
      }));

      const { error: roadmapError } = await admin
        .from("roadmap_progress")
        .insert(roadmapRows);

      if (roadmapError) {
        console.error("[auth callback] Failed to seed roadmap:", roadmapError);
      }
    }

    const dest = ROLE_REDIRECTS[invite.role as Role];
    return NextResponse.redirect(`${origin}${dest}`);
  }

  // Handle magic link registration
  if (magicCode) {
    const { data: magicLink } = await admin
      .from("magic_links")
      .select("id, code, role, created_by, expires_at, max_uses, use_count, is_active")
      .eq("code", magicCode)
      .single();

    if (
      !magicLink ||
      !magicLink.is_active ||
      (magicLink.expires_at && new Date(magicLink.expires_at) < new Date()) ||
      (magicLink.max_uses !== null && magicLink.use_count >= magicLink.max_uses)
    ) {
      return NextResponse.redirect(
        `${origin}/register?magic=${magicCode}&error=magic_link_invalid`
      );
    }

    // Validate role
    const validRoles = Object.keys(ROLE_REDIRECTS);
    if (!validRoles.includes(magicLink.role)) {
      console.error("[auth callback] Invalid magic link role:", magicLink.role);
      return NextResponse.redirect(
        `${origin}/register?magic=${magicCode}&error=magic_link_invalid`
      );
    }

    // Atomically claim a slot using optimistic locking on use_count
    const { data: claimed, error: claimError } = await admin
      .from("magic_links")
      .update({ use_count: magicLink.use_count + 1 })
      .eq("id", magicLink.id)
      .eq("use_count", magicLink.use_count) // optimistic lock — fails if another request already incremented
      .eq("is_active", true)
      .select("id")
      .single();

    if (claimError || !claimed) {
      console.error(
        "[auth callback] Magic link claim failed (concurrent use or deactivated):",
        claimError
      );
      return NextResponse.redirect(
        `${origin}/register?magic=${magicCode}&error=magic_link_invalid`
      );
    }

    // Check if this email is already registered
    const { data: existingUser } = await admin
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    if (existingUser) {
      // Rollback use_count increment since no new user was created
      const { error: rollbackError } = await admin
        .from("magic_links")
        .update({ use_count: magicLink.use_count })
        .eq("id", magicLink.id)
        .eq("use_count", magicLink.use_count + 1);
      if (rollbackError) {
        console.error("[auth callback] Magic link rollback failed (existing user):", rollbackError);
      }
      return NextResponse.redirect(`${origin}/login?error=already_registered`);
    }

    // Determine coach_id if magic link was created by a coach
    let coachId: string | null = null;
    if (magicLink.role === "student") {
      const { data: creator } = await admin
        .from("users")
        .select("id, role")
        .eq("id", magicLink.created_by)
        .single();

      if (creator?.role === "coach") {
        coachId = creator.id;
      }
    }

    // Extract and truncate user name
    const mlRawName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email.split("@")[0];
    const mlUserName =
      typeof mlRawName === "string"
        ? mlRawName.slice(0, VALIDATION.name.max)
        : user.email.split("@")[0];

    // Create user profile
    const { data: mlNewUser, error: mlInsertError } = await admin
      .from("users")
      .insert({
        auth_id: user.id,
        email: user.email,
        name: mlUserName,
        role: magicLink.role as Role,
        coach_id: coachId,
      })
      .select("id")
      .single();

    if (mlInsertError || !mlNewUser) {
      console.error("[auth callback] Failed to create user via magic link:", mlInsertError);
      // Rollback use_count increment (optimistic lock to avoid overwriting concurrent increment)
      const { error: rollbackError } = await admin
        .from("magic_links")
        .update({ use_count: magicLink.use_count })
        .eq("id", magicLink.id)
        .eq("use_count", magicLink.use_count + 1);
      if (rollbackError) {
        console.error(
          "[auth callback] CRITICAL: Failed to rollback magic link use_count for",
          magicLink.id,
          rollbackError
        );
      }
      return NextResponse.redirect(`${origin}/register?magic=${magicCode}&error=auth_failed`);
    }

    // If student or student_diy, seed roadmap progress
    if (magicLink.role === "student" || magicLink.role === "student_diy") {
      const mlRoadmapRows = ROADMAP_STEPS.map((step) => ({
        student_id: mlNewUser.id,
        step_number: step.step,
        step_name: step.title,
        status:
          step.step === 1
            ? ("completed" as const)
            : step.step === 2
              ? ("active" as const)
              : ("locked" as const),
        completed_at: step.step === 1 ? new Date().toISOString() : null,
      }));

      const { error: roadmapError } = await admin
        .from("roadmap_progress")
        .insert(mlRoadmapRows);

      if (roadmapError) {
        console.error("[auth callback] Failed to seed roadmap:", roadmapError);
      }
    }

    const dest = ROLE_REDIRECTS[magicLink.role as Role];
    return NextResponse.redirect(`${origin}${dest}`);
  }

  // No invite_code or magic_code param — check if email is whitelisted via invite
  // IMPORTANT: match on a normalized value with .eq(), never .ilike().
  // ILIKE treats `_` and `%` in the pattern as wildcards, and the pattern here
  // is an IdP-supplied address the signer-in chooses. `newcoac_@corp.com` would
  // ILIKE-match an invite issued to `newcoach@corp.com`, consuming someone
  // else's invite and inheriting its role (up to coach) and coach_id. Invite
  // emails are normalized to lowercase on write (api/invites), so comparing
  // lowercase-to-lowercase preserves the case-insensitivity this needs without
  // giving the caller pattern syntax. A mixed-case row seeded directly via SQL
  // would not match — that fails closed, which is the safe direction.
  const { data: whitelistInvite } = await admin
    .from("invites")
    .select("id, email, role, coach_id, used, expires_at")
    .eq("email", user.email.toLowerCase())
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (whitelistInvite) {
    // Atomically mark invite as used (prevents race condition)
    const { data: consumed } = await admin
      .from("invites")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", whitelistInvite.id)
      .eq("used", false)
      .select("id")
      .single();

    if (consumed) {
      // Validate invite role
      const wlValidRoles = Object.keys(ROLE_REDIRECTS);
      if (!wlValidRoles.includes(whitelistInvite.role)) {
        console.error("[auth callback] Invalid whitelist invite role:", whitelistInvite.role);
        // Rollback
        await admin
          .from("invites")
          .update({ used: false, used_at: null })
          .eq("id", whitelistInvite.id);
        return NextResponse.redirect(`${origin}/no-access`);
      }

      // Extract and truncate user name
      const wlRawName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email.split("@")[0];
      const wlUserName =
        typeof wlRawName === "string"
          ? wlRawName.slice(0, VALIDATION.name.max)
          : user.email.split("@")[0];

      // Create user profile
      const { data: wlNewUser, error: wlInsertError } = await admin
        .from("users")
        .insert({
          auth_id: user.id,
          email: user.email,
          name: wlUserName,
          role: whitelistInvite.role as Role,
          coach_id: whitelistInvite.coach_id,
        })
        .select("id")
        .single();

      if (wlInsertError || !wlNewUser) {
        console.error("[auth callback] Failed to create user via whitelist invite:", wlInsertError);
        // Rollback invite consumption
        const { error: rollbackError } = await admin
          .from("invites")
          .update({ used: false, used_at: null })
          .eq("id", whitelistInvite.id);
        if (rollbackError) {
          console.error(
            "[auth callback] CRITICAL: Failed to rollback whitelist invite consumption for invite",
            whitelistInvite.id,
            rollbackError
          );
        }
        return NextResponse.redirect(`${origin}/no-access`);
      }

      // If student or student_diy, seed roadmap progress
      if (whitelistInvite.role === "student" || whitelistInvite.role === "student_diy") {
        const wlRoadmapRows = ROADMAP_STEPS.map((step) => ({
          student_id: wlNewUser.id,
          step_number: step.step,
          step_name: step.title,
          status:
            step.step === 1
              ? ("completed" as const)
              : step.step === 2
                ? ("active" as const)
                : ("locked" as const),
          completed_at: step.step === 1 ? new Date().toISOString() : null,
        }));

        const { error: roadmapError } = await admin
          .from("roadmap_progress")
          .insert(wlRoadmapRows);

        if (roadmapError) {
          console.error("[auth callback] Failed to seed roadmap for whitelist invite:", roadmapError);
        }
      }

      const dest = ROLE_REDIRECTS[whitelistInvite.role as Role];
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  // No invite code or magic code — no profile — needs invite
  return NextResponse.redirect(`${origin}/no-access`);
}
