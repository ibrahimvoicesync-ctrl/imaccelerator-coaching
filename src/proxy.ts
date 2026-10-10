import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_ROUTES: Record<string, string> = {
  owner: "/owner",
  coach: "/coach",
  student: "/student",
  student_diy: "/student_diy",
};

const ROLE_ROUTE_ACCESS: Record<string, string[]> = {
  owner: ["/owner"],
  coach: ["/coach"],
  student: ["/student"],
  student_diy: ["/student_diy"],
};

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Fully public — no sign-in, and no redirect for signed-in users either
  if (path === "/ai-preview" || path.startsWith("/ai-preview/")) {
    return supabaseResponse;
  }

  // Public routes — if logged in, redirect to role dashboard
  if (
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/no-access")
  ) {
    if (user) {
      // Use service-role client to bypass RLS — the anon client's RLS
      // policies can fail when session isn't fully established yet
      const admin = createClient(
        process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: profile } = await admin
        .from("users")
        .select("role")
        .eq("auth_id", user.id)
        .single();

      if (profile) {
        const url = request.nextUrl.clone();
        url.pathname = DEFAULT_ROUTES[profile.role] || "/";
        return NextResponse.redirect(url);
      }
    }
    return supabaseResponse;
  }

  // Protected routes — must be logged in
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Role-based route protection — use service-role client to bypass RLS
  const admin = createClient(
    process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .single();

  if (!profile) {
    const url = request.nextUrl.clone();
    url.pathname = "/no-access";
    return NextResponse.redirect(url);
  }

  const allowedPrefixes = ROLE_ROUTE_ACCESS[profile.role] || [];
  const isAllowed = allowedPrefixes.some((prefix) => path.startsWith(prefix));

  if (!isAllowed) {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_ROUTES[profile.role] || "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Exclude static files, images, favicon, the service worker / web manifest,
    // and API routes from the proxy guard. The push service worker (/sw.js) and
    // /manifest.json MUST be publicly served — otherwise the auth guard
    // redirects them to /login and registration/installability break.
    "/((?!_next/static|_next/image|favicon.ico|api/|sw\\.js|manifest\\.json|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
