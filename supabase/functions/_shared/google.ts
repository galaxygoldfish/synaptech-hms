// Minimal Google API client for sync-member-groups: a service-account access
// token, a Drive folder listing and Sheets reads. Read-only scopes only.
//
// Errors carry the HTTP status but never a response body, a token or the
// key — they end up in member_group_sync_runs, which admins can read.

import { importPKCS8, SignJWT } from "npm:jose@5";
import { isProjectFolder, type SheetTab } from "./memberGroups.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const EXCEL_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

/** More sheets than this is almost certainly the wrong folder. */
const MAX_FILES = 200;
/** Folder listing requests per run (pages included), so a huge or wrong folder fails fast. */
const MAX_FOLDER_LISTINGS = 300;

/** Thrown when the groups folder is too big to be the right one. */
class FolderTooLargeError extends Error {
  constructor() {
    super(`The groups folder is too large to sync (over ${MAX_FILES} sheets or ${MAX_FOLDER_LISTINGS} folder pages) — check GROUP_SHEETS_FOLDER_ID`);
  }
}

/** Shared across one walk of the groups folder. */
interface WalkBudget {
  listings: number;
  sheets: number;
}
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

interface FolderChildren {
  sheets: FolderSpreadsheet[];
  folders: Array<{ id: string; name: string }>;
  excelFiles: number;
}

/** One folder's direct children: sheets, subfolders (shortcuts resolved), and a count of Excel files. */
async function listFolderChildren(token: string, folderId: string, budget: WalkBudget): Promise<FolderChildren> {
  const escapedFolder = folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const children: FolderChildren = { sheets: [], folders: [], excelFiles: 0 };
  let pageToken: string | undefined;
  do {
    if (++budget.listings > MAX_FOLDER_LISTINGS) throw new FolderTooLargeError();
    const params = new URLSearchParams({
      q: `'${escapedFolder}' in parents and trashed = false`,
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
      const target = file.mimeType === SHORTCUT_MIME
        ? { id: file.shortcutDetails?.targetId, mimeType: file.shortcutDetails?.targetMimeType }
        : { id: file.id, mimeType: file.mimeType };
      if (!target.id) continue;
      if (target.mimeType === SPREADSHEET_MIME) {
        children.sheets.push({ spreadsheetId: target.id, name: file.name });
      } else if (target.mimeType === FOLDER_MIME) {
        children.folders.push({ id: target.id, name: file.name });
      }
      else if (target.mimeType && EXCEL_MIMES.has(target.mimeType)) children.excelFiles++;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return children;
}

/** A project group as found in Drive: its name and the sheets that might hold its members list. */
export interface GroupSource {
  name: string;
  spreadsheets: FolderSpreadsheet[];
  /** Excel files seen in the group's folder — unreadable until converted. */
  excelFiles: number;
}

/** How deep inside a project's folder to look for its sheets. */
const MAX_PROJECT_DEPTH = 3;

/**
 * The groups folder's projects. Each subfolder is one group, named after the
 * folder, holding every Google Sheet inside it (to MAX_PROJECT_DEPTH levels).
 * A sheet sitting loose in the groups folder is a group of its own, named by
 * its title. Shortcuts count as what they point at.
 */
export async function listGroupSources(token: string, rootFolderId: string): Promise<{ groups: GroupSource[]; rootExcelFiles: number }> {
  const budget: WalkBudget = { listings: 0, sheets: 0 };
  const root = await listFolderChildren(token, rootFolderId, budget);
  budget.sheets = root.sheets.length;
  if (budget.sheets > MAX_FILES || root.folders.length > MAX_FILES) throw new FolderTooLargeError();
  const groups: GroupSource[] = root.sheets.map((sheet) => ({ name: sheet.name, spreadsheets: [sheet], excelFiles: 0 }));

  // Numbered folders ("0. Project Example", "2. Standup Templates") are
  // housekeeping, not projects.
  for (const project of root.folders.filter((folder) => isProjectFolder(folder.name))) {
    const seen = new Set<string>([rootFolderId, project.id]);
    const sheets = new Map<string, FolderSpreadsheet>();
    let excelFiles = 0;
    let level = [project.id];
    for (let depth = 0; depth < MAX_PROJECT_DEPTH && level.length > 0; depth++) {
      const next: string[] = [];
      for (const folderId of level) {
        const children = await listFolderChildren(token, folderId, budget);
        for (const sheet of children.sheets) {
          if (!sheets.has(sheet.spreadsheetId)) {
            sheets.set(sheet.spreadsheetId, sheet);
            if (++budget.sheets > MAX_FILES) throw new FolderTooLargeError();
          }
        }
        excelFiles += children.excelFiles;
        for (const folder of children.folders) {
          if (!seen.has(folder.id)) {
            seen.add(folder.id);
            next.push(folder.id);
          }
        }
      }
      level = next;
    }
    groups.push({ name: project.name, spreadsheets: [...sheets.values()], excelFiles });
  }

  return { groups, rootExcelFiles: root.excelFiles };
}


/**
 * The groups folder's name, or a readable error saying why it can't be
 * opened. Drive answers a listing of an unshared folder with an empty list,
 * not an error, so this is what tells "not shared" apart from "empty".
 */
export async function getFolderName(token: string, folderId: string, serviceAccountEmail: string): Promise<string> {
  const params = new URLSearchParams({ fields: "name, mimeType", supportsAllDrives: "true" });
  const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(folderId)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    await response.body?.cancel();
    throw new Error(
      `The groups folder can't be found. Check GROUP_SHEETS_FOLDER_ID, and that the folder is shared with ${serviceAccountEmail} as Viewer`,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new GoogleApiError("Drive folder lookup", response.status);
  }
  const folder = (await response.json()) as { name?: string; mimeType?: string };
  if (folder.mimeType !== FOLDER_MIME) {
    throw new Error("GROUP_SHEETS_FOLDER_ID points at a file, not a folder");
  }
  return folder.name ?? "groups folder";
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
