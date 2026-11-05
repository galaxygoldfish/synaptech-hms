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

/**
 * The emails in a tab's members table, normalised and de-duplicated, or null
 * when the tab has no email column at all. Reading stops at the first fully
 * blank row — the end of the table — so notes further down aren't counted.
 * A row with other data but no email is skipped rather than ending the table.
 */
export function extractEmails(rows: string[][]): string[] | null {
  const header = findEmailColumn(rows);
  if (!header) return null;

  const emails = new Set<string>();
  for (let r = header.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) break;
    const match = (row[header.column] ?? '').match(EMAIL_PATTERN);
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
 * The group's display name. Currently the spreadsheet's file title — if the
 * name moves into a cell of the sheet, this is the one place to change.
 */
export function groupNameFor(file: { name: string }): string {
  return file.name.trim() || 'Untitled group';
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
