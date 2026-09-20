// Invoked from the "Delete account" button on the admin Member Detail
// screen (src/components/admin-dashboard/MemberDetail.tsx) via
// supabase.functions.invoke — the client can't do this itself: deleting
// another user's auth.users row needs auth.admin.deleteUser, which needs
// the service-role key, which per CLAUDE.md must never reach the browser.
//
// Deploy: supabase functions deploy delete-user
// (default JWT verification stays on — unlike send-email/
// send-scheduled-reminders, the caller here is a logged-in admin's browser
// presenting their own session JWT, not Postgres or a cron secret.)
//
// Body: { userId: string } — the profile/auth user to delete. The caller
// must already be an admin; there is no further restriction (self-delete
// and deleting the last remaining admin are both allowed — the client
// warns about the latter before confirming).

import { createAdminClient } from "../_shared/db.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ ok: false, error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: { userId?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { userId } = payload;
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "userId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();

  // auth.getUser validates the JWT against the auth server regardless of
  // which client it's called on — this is the one legitimate use of the
  // service-role client to authenticate an end user, since the function
  // has no anon key of its own to spare.
  const {
    data: { user: caller },
    error: callerError,
  } = await admin.auth.getUser(jwt);
  if (callerError || !caller) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid or expired session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (callerProfileError) {
    // eslint-disable-next-line no-console
    console.error("delete-user: failed to look up caller profile:", callerProfileError);
    return new Response(JSON.stringify({ ok: false, error: "Could not verify caller" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (callerProfile?.role !== "admin") {
    return new Response(JSON.stringify({ ok: false, error: "Admin access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", userId);
  if (deleteProfileError) {
    // eslint-disable-next-line no-console
    console.error(`delete-user: failed to delete profile ${userId}:`, deleteProfileError);
    return new Response(JSON.stringify({ ok: false, error: deleteProfileError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // The profiles row is already gone at this point regardless of what
  // happens below — a missing auth.users row (already deleted, or never
  // had one) isn't a failure worth reporting back to the admin.
  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
  if (deleteAuthError && deleteAuthError.status !== 404) {
    // eslint-disable-next-line no-console
    console.error(`delete-user: profile ${userId} deleted, but auth user deletion failed:`, deleteAuthError);
    return new Response(JSON.stringify({ ok: false, error: deleteAuthError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
