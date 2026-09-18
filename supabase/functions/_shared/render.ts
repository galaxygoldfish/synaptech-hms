// Mirrors EmailBodySegment from src/lib/emailTemplates.ts — kept as a
// duplicate type rather than a shared import since Deno (functions/) and
// the Vite app (src/) don't share a module graph.
export type EmailBodySegment = { type: "text"; value: string } | { type: "chip"; field: string };

export function renderSegments(body: EmailBodySegment[], fields: Record<string, string>): string {
  return body.map((segment) => (segment.type === "text" ? segment.value : fields[segment.field] ?? "")).join("");
}

// Every value passed through here can originate from something a member or
// admin typed — a profile name, a hardware item's name, an admin's note on
// a loan. None of it is safe to drop into HTML unescaped: this is the only
// thing standing between, say, a hardware item named `<img src=x
// onerror=alert(1)>` and that markup executing wherever the rendered email
// is later displayed (a mail client, or the admin email log's preview).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Same segments as renderSegments, but escaped and with newlines turned
// into <br> — HTML collapses literal line breaks, which renderSegments'
// plain-text output relies on.
export function renderSegmentsHtml(body: EmailBodySegment[], fields: Record<string, string>): string {
  return body
    .map((segment) => {
      const raw = segment.type === "text" ? segment.value : fields[segment.field] ?? "";
      return escapeHtml(raw).replace(/\n/g, "<br>");
    })
    .join("");
}
