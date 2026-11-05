// Minimal Google API client for sync-member-groups: a service-account access
// token, a Drive folder listing and Sheets reads. Read-only scopes only.
//
// Errors carry the HTTP status but never a response body, a token or the
// key — they end up in member_group_sync_runs, which admins can read.

import { importPKCS8, SignJWT } from "npm:jose@5";
import type { SheetTab } from "./memberGroups.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

/** Folder listings beyond this are almost certainly the wrong folder. */
const MAX_FILES = 200;
/** Columns/rows read per tab — far more than any group's members table. */
const TAB_RANGE = "A1:Z1000";

export class GoogleApiError extends Error {
  constructor(what: string, public status: number) {
    super(`Google ${what} failed (HTTP ${status})`);
  }
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(json: string): ServiceAccountKey {
  let parsed: Partial<ServiceAccountKey>;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export async function getGoogleAccessToken(key: ServiceAccountKey, scopes = GOOGLE_SCOPES): Promise<string> {
  const signingKey = await importPKCS8(key.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: scopes.join(" ") })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(key.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(signingKey);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new GoogleApiError("sign-in", response.status);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new GoogleApiError("sign-in", response.status);
  return body.access_token;
}

async function googleGet<T>(url: string, token: string, what: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    // Drained so the connection is released; deliberately not surfaced.
    await response.body?.cancel();
    throw new GoogleApiError(what, response.status);
  }
  return (await response.json()) as T;
}

export interface FolderSpreadsheet {
  /** The spreadsheet's own id (a shortcut's target, for shortcuts). */
  spreadsheetId: string;
  name: string;
}

/**
 * Every Google Sheet directly in the folder, including shortcuts to sheets
 * kept elsewhere — so a group can keep its sheet in its own folder and just
 * drop a shortcut into the groups folder.
 */
export async function listFolderSpreadsheets(token: string, folderId: string): Promise<FolderSpreadsheet[]> {
  const escapedFolder = folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q =
    `'${escapedFolder}' in parents and trashed = false and ` +
    `(mimeType = '${SPREADSHEET_MIME}' or mimeType = '${SHORTCUT_MIME}')`;

  const results: FolderSpreadsheet[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id, name, mimeType, shortcutDetails(targetId, targetMimeType))",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const page = await googleGet<{
      nextPageToken?: string;
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        shortcutDetails?: { targetId?: string; targetMimeType?: string };
      }>;
    }>(`${DRIVE_FILES_URL}?${params}`, token, "Drive folder listing");

    for (const file of page.files ?? []) {
      if (file.mimeType === SPREADSHEET_MIME) {
        results.push({ spreadsheetId: file.id, name: file.name });
      } else if (file.shortcutDetails?.targetMimeType === SPREADSHEET_MIME && file.shortcutDetails.targetId) {
        results.push({ spreadsheetId: file.shortcutDetails.targetId, name: file.name });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken && results.length < MAX_FILES);

  // A sheet both in the folder and shortcut into it counts once.
  const unique = new Map(results.map((file) => [file.spreadsheetId, file]));
  return [...unique.values()].slice(0, MAX_FILES);
}

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * The tabs of one spreadsheet, as rows of display strings. With `onlyTab`
 * set, just that tab (a missing tab is a 400 from Google, surfaced as a
 * GoogleApiError); otherwise every grid tab, in sheet order.
 */
export async function readSpreadsheetTabs(token: string, spreadsheetId: string, onlyTab?: string): Promise<SheetTab[]> {
  const id = encodeURIComponent(spreadsheetId);

  let titles: string[];
  if (onlyTab) {
    titles = [onlyTab];
  } else {
    const meta = await googleGet<{ sheets?: Array<{ properties?: { title?: string; sheetType?: string } }> }>(
      `${SHEETS_URL}/${id}?fields=sheets.properties(title,sheetType)`,
      token,
      "Sheets metadata read",
    );
    titles = (meta.sheets ?? [])
      .map((sheet) => sheet.properties)
      .filter((props) => props?.title && (props.sheetType ?? "GRID") === "GRID")
      .map((props) => props!.title!);
  }
  if (titles.length === 0) return [];

  const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE" });
  for (const title of titles) params.append("ranges", `${quoteSheetTitle(title)}!${TAB_RANGE}`);

  const values = await googleGet<{ valueRanges?: Array<{ values?: unknown[][] }> }>(
    `${SHEETS_URL}/${id}/values:batchGet?${params}`,
    token,
    "Sheets values read",
  );

  return titles.map((title, index) => ({
    title,
    rows: (values.valueRanges?.[index]?.values ?? []).map((row) => row.map((cell) => String(cell ?? ""))),
  }));
}
