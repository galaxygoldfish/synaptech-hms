// Mirrors EmailBodySegment from src/lib/emailTemplates.ts — kept as a
// duplicate type rather than a shared import since Deno (functions/) and
// the Vite app (src/) don't share a module graph.
export type EmailBodySegment = { type: "text"; value: string } | { type: "chip"; field: string };

export function renderSegments(body: EmailBodySegment[], fields: Record<string, string>): string {
  return body.map((segment) => (segment.type === "text" ? segment.value : fields[segment.field] ?? "")).join("");
}
