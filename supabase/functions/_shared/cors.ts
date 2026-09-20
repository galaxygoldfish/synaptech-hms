// send-email and send-scheduled-reminders are only ever called by Postgres
// (pg_net) or Cron, so neither needed this — delete-user is the first
// function invoked directly from the browser via supabase.functions.invoke,
// which means the browser sends a CORS preflight OPTIONS request first.
// Without a response to it, the actual POST never leaves the browser.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
