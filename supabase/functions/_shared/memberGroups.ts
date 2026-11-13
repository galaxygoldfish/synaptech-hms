// Pure parsing/matching for sync-member-groups. No Deno or network APIs, so
// the Vitest suite can import it directly (src/test/memberGroups.parse.test.ts).
//
// Each project group's Google Sheet has, on one of its tabs, a members table
// with an email column. Everything else about the sheets varies: tab names
// aren't standardised yet, there may be a title row above the table, and
// other columns come and go — so the parser only relies on finding a header
// cell that says "email".

/** One tab's cell values, as the Sheets API returns them (ragged rows). */
export interface SheetTab {
  title: string;
  rows: string[][];
}

/** A group's sheet once parsed: its name and the emails on it. */
export interface GroupSheet {
  spreadsheetId: string;
  name: string;
  emails: string[];
}

export interface MemberForMatching {
  id: string;
  first_name: string;
  last_name: string;
  uw_email: string;
}

export interface MemberGroupAssignment {
  project_group: string | null;
  project_group_size: number;
}

/** How far down a tab to look for the header row. */
const HEADER_SEARCH_ROWS = 10;

// "Email", "E-mail", "UW Email", "Email address"… Short cells only, so a
// title row like "Contact the lead by email with questions" isn't taken
// for the header.
const HEADER_PATTERN = /e-?mail/i;
const HEADER_MAX_LENGTH = 40;

// The first email-shaped token in a cell, so "Ada Lovelace <ada@uw.edu>" and
// "mailto:ada@uw.edu" both work.
const EMAIL_PATTERN = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/i;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** The header row and email column of a tab's table, or null if it has none. */
export function findEmailColumn(rows: string[][]): { headerRow: number; column: number } | null {
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] ?? '').trim();
      if (cell && cell.length <= HEADER_MAX_LENGTH && HEADER_PATTERN.test(cell)) {
        return { headerRow: r, column: c };
      }
    }
  }
  return null;
}

function isBlankRow(row: string[] | undefined): boolean {
  return !row || row.every((cell) => !cell || !cell.trim());
}

const UW_EMAIL = /@uw\.edu$/i;

/**
 * The column whose cells hold the most email addresses — @uw.edu ones
 * counted first, since that's what members sign in with. Null if no cell in
 * the tab holds an email. Header wording doesn't matter.
 */
export function findEmailColumnByContent(rows: string[][]): number | null {
  const scores = new Map<number, { uw: number; any: number }>();
  for (const row of rows) {
    row.forEach((cell, column) => {
      const match = (cell ?? '').match(EMAIL_PATTERN);
      if (!match) return;
      const score = scores.get(column) ?? { uw: 0, any: 0 };
      score.any++;
      if (UW_EMAIL.test(match[0])) score.uw++;
      scores.set(column, score);
    });
  }
  let best: number | null = null;
  let bestScore = { uw: 0, any: 0 };
  for (const [column, score] of [...scores].sort(([a], [b]) => a - b)) {
    if (score.uw > bestScore.uw || (score.uw === bestScore.uw && score.any > bestScore.any)) {
      best = column;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The emails in a tab's members table, normalised and de-duplicated, or null
 * when the tab has no email column at all.
 *
 * With a header cell saying "email", reading starts under it and stops at
 * the first fully blank row — the end of the table — so notes further down
 * aren't counted; a row with other data but no email is skipped rather than
 * ending the table. Without one, the column is found by its contents (the
 * most @uw.edu addresses) and every email in it is taken.
 */
export function extractEmails(rows: string[][]): string[] | null {
  const emails = new Set<string>();
  const header = findEmailColumn(rows);
  if (header) {
    for (let r = header.headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (isBlankRow(row)) break;
      const match = (row[header.column] ?? '').match(EMAIL_PATTERN);
      if (match) emails.add(normalizeEmail(match[0]));
    }
    if (emails.size > 0) return [...emails];
  }

  // No usable header (missing, or a header-like cell over the wrong column):
  // go by what the cells hold.
  const column = findEmailColumnByContent(rows);
  if (column === null) return header ? [] : null;
  for (const row of rows) {
    const match = (row[column] ?? '').match(EMAIL_PATTERN);
    if (match) emails.add(normalizeEmail(match[0]));
  }
  return [...emails];
}

/**
 * The members list of a whole spreadsheet: the first tab (in sheet order)
 * whose table has at least one email. Null if no tab has an email column.
 */
export function emailsFromTabs(tabs: SheetTab[]): string[] | null {
  let sawEmailColumn = false;
  for (const tab of tabs) {
    const emails = extractEmails(tab.rows);
    if (emails === null) continue;
    sawEmailColumn = true;
    if (emails.length > 0) return emails;
  }
  return sawEmailColumn ? [] : null;
}

/**
 * The group's display name: the project's folder name (or, for a sheet sitting
 * loose in the groups folder, its file title). If the name moves into a cell
 * of the sheet, this is the one place to change.
 */
export function groupNameFor(source: { name: string }): string {
  return source.name.trim() || 'Untitled group';
}

/** One spreadsheet in a project's folder, once read. */
export interface CandidateSheet {
  spreadsheetId: string;
  name: string;
  /** null: no tab has an email column. */
  emails: string[] | null;
}

// A title that says it's the members list wins over a bigger sheet that
// merely has an email column (a sign-up form, a contacts list).
const ROSTER_TITLE = /member|roster|team/i;

/**
 * Which of a project folder's sheets is its members list: among sheets with
 * at least one email, one titled like a roster first, then the most emails,
 * then by title so the pick is stable. `others` names the sheets passed over,
 * so the sync can say which one it used.
 */
export function pickRosterSheet(
  sheets: CandidateSheet[],
): { chosen: CandidateSheet & { emails: string[] }; others: string[] } | null {
  const withEmails = sheets.filter(
    (sheet): sheet is CandidateSheet & { emails: string[] } => !!sheet.emails && sheet.emails.length > 0,
  );
  if (withEmails.length === 0) return null;
  const ranked = [...withEmails].sort(
    (a, b) =>
      Number(ROSTER_TITLE.test(b.name)) - Number(ROSTER_TITLE.test(a.name)) ||
      b.emails.length - a.emails.length ||
      a.name.localeCompare(b.name),
  );
  return { chosen: ranked[0], others: ranked.slice(1).map((sheet) => sheet.name) };
}

/**
 * Who is in which group. Every member gets an assignment — unmatched members
 * get { null, 1 } so a member who left a group is reset rather than kept.
 *
 * A member listed in more than one sheet is shown in the largest of them
 * (ties broken by name, so the result is stable night to night) and reported
 * as a warning for an officer to sort out.
 */
export function resolveMemberGroups(
  members: MemberForMatching[],
  groups: GroupSheet[],
): { assignments: Map<string, MemberGroupAssignment>; warnings: string[] } {
  const groupsByEmail = new Map<string, GroupSheet[]>();
  for (const group of groups) {
    for (const email of group.emails) {
      const list = groupsByEmail.get(email) ?? [];
      list.push(group);
      groupsByEmail.set(email, list);
    }
  }

  const assignments = new Map<string, MemberGroupAssignment>();
  const warnings: string[] = [];

  for (const member of members) {
    const matches = groupsByEmail.get(normalizeEmail(member.uw_email ?? '')) ?? [];
    if (matches.length === 0) {
      assignments.set(member.id, { project_group: null, project_group_size: 1 });
      continue;
    }

    const [chosen] = [...matches].sort(
      (a, b) => b.emails.length - a.emails.length || a.name.localeCompare(b.name),
    );
    assignments.set(member.id, { project_group: chosen.name, project_group_size: chosen.emails.length });

    if (matches.length > 1) {
      const name = `${member.first_name} ${member.last_name}`.trim() || member.uw_email;
      const names = matches.map((group) => group.name).sort().join(', ');
      warnings.push(`${name} is listed in ${matches.length} groups (${names}); showing ${chosen.name}.`);
    }
  }

  return { assignments, warnings };
}
