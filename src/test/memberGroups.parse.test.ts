import {
  emailsFromTabs,
  extractEmails,
  findEmailColumn,
  groupNameFor,
  isProjectFolder,
  pickRosterSheet,
  resolveMemberGroups,
  rosterCandidates,
  sameGroups,
  type GroupSheet,
} from '../../supabase/functions/_shared/memberGroups'

describe('findEmailColumn', () => {
  it('finds the header on the first row', () => {
    expect(findEmailColumn([['Name', 'Email', 'Role']])).toEqual({ headerRow: 0, column: 1 })
  })

  it('finds a header below a title row, in any of its usual spellings', () => {
    expect(findEmailColumn([['EEG Speller team'], [], ['Name', 'UW E-mail']])).toEqual({ headerRow: 2, column: 1 })
    expect(findEmailColumn([['Email address', 'Name']])).toEqual({ headerRow: 0, column: 0 })
  })

  it('does not take a sentence that mentions email for the header', () => {
    expect(findEmailColumn([['Questions? Contact the project lead by email any time']])).toBeNull()
  })

  it('returns null when there is no email column', () => {
    expect(findEmailColumn([['Name', 'Role'], ['Ada', 'Lead']])).toBeNull()
  })
})

describe('extractEmails', () => {
  it('normalises case and whitespace, and counts each person once', () => {
    const rows = [['Name', 'Email'], ['Ada', ' Ada@UW.edu '], ['Ada again', 'ada@uw.edu'], ['Bob', 'bob@uw.edu']]
    expect(extractEmails(rows)).toEqual(['ada@uw.edu', 'bob@uw.edu'])
  })

  it('pulls the address out of a cell with a name or mailto around it', () => {
    const rows = [['Email'], ['Ada Lovelace <ada@uw.edu>'], ['mailto:bob@uw.edu']]
    expect(extractEmails(rows)).toEqual(['ada@uw.edu', 'bob@uw.edu'])
  })

  it('stops at the first fully blank row, so notes below the table are not counted', () => {
    const rows = [['Email'], ['ada@uw.edu'], ['', ''], ['Alumni'], ['old@uw.edu']]
    expect(extractEmails(rows)).toEqual(['ada@uw.edu'])
  })

  it('skips a row that has other data but no email, without ending the table', () => {
    const rows = [['Name', 'Email'], ['Ada', 'ada@uw.edu'], ['TBD', ''], ['Bob', 'bob@uw.edu']]
    expect(extractEmails(rows)).toEqual(['ada@uw.edu', 'bob@uw.edu'])
  })

  it('ignores cells that are not an email', () => {
    expect(extractEmails([['Email'], ['not provided'], ['ada@uw.edu']])).toEqual(['ada@uw.edu'])
  })

  it('returns null for a tab with no email column', () => {
    expect(extractEmails([['Task', 'Owner']])).toBeNull()
  })

  it('finds the column by its @uw.edu contents when no header says email', () => {
    const rows = [
      ['Project Members'],
      ['Name', 'NetID', 'Role'],
      ['Ada', 'ada@uw.edu', 'Lead'],
      [],
      ['Bob', 'BOB@uw.edu', 'Member'],
    ]
    expect(extractEmails(rows)).toEqual(['ada@uw.edu', 'bob@uw.edu'])
  })

  it('prefers the column with more @uw.edu addresses over one with other emails', () => {
    const rows = [
      ['Name', 'Personal', 'School'],
      ['Ada', 'ada@gmail.com', 'ada@uw.edu'],
      ['Bob', 'bob@gmail.com', 'bob@uw.edu'],
      ['Cy', 'cy@gmail.com', ''],
    ]
    expect(extractEmails(rows)).toEqual(['ada@uw.edu', 'bob@uw.edu'])
  })

  it('falls back to contents when the header-like cell sits over an empty column', () => {
    const rows = [['Email us with questions', 'Name', 'Contact'], ['', 'Ada', 'ada@uw.edu']]
    expect(extractEmails(rows)).toEqual(['ada@uw.edu'])
  })
})

describe('emailsFromTabs', () => {
  it('uses the first tab that has a members table, whatever it is called', () => {
    const tabs = [
      { title: 'Timeline', rows: [['Week', 'Goal']] },
      { title: 'Team Roster', rows: [['Email'], ['ada@uw.edu']] },
      { title: 'Contacts', rows: [['Email'], ['sponsor@example.com']] },
    ]
    expect(emailsFromTabs(tabs)).toEqual(['ada@uw.edu'])
  })

  it('reads a tab named like the members list before tabs to its left', () => {
    const tabs = [
      { title: 'Sign-ups', rows: [['Email'], ['x@uw.edu'], ['y@uw.edu']] },
      { title: 'Project Members', rows: [['Name', 'UW'], ['Ada', 'ada@uw.edu']] },
    ]
    expect(emailsFromTabs(tabs)).toEqual(['ada@uw.edu'])
  })

  it('falls back to other tabs when the members tab has no emails', () => {
    const tabs = [
      { title: 'Members', rows: [['Email']] },
      { title: 'Sheet1', rows: [['Email'], ['ada@uw.edu']] },
    ]
    expect(emailsFromTabs(tabs)).toEqual(['ada@uw.edu'])
  })

  it('distinguishes an empty members table from no members table at all', () => {
    expect(emailsFromTabs([{ title: 'Members', rows: [['Email']] }])).toEqual([])
    expect(emailsFromTabs([{ title: 'Notes', rows: [['Hello']] }])).toBeNull()
  })
})

describe('groupNameFor', () => {
  it('uses the spreadsheet title', () => {
    expect(groupNameFor({ name: '  EEG Speller  ' })).toBe('EEG Speller')
  })

  it('falls back for an untitled sheet', () => {
    expect(groupNameFor({ name: '   ' })).toBe('Untitled group')
  })
})

describe('pickRosterSheet', () => {
  const sheet = (name: string, emails: string[] | null) => ({ spreadsheetId: name, name, emails })

  it('returns null when no sheet has emails', () => {
    expect(pickRosterSheet([sheet('Budget', null), sheet('Sign-ups', [])])).toBeNull()
  })

  it('takes the only sheet with emails', () => {
    expect(pickRosterSheet([sheet('Budget', null), sheet('Plan', ['a@uw.edu'])])).toEqual({
      chosen: sheet('Plan', ['a@uw.edu']),
      others: [],
    })
  })

  it('prefers a roster-like title over a bigger sheet', () => {
    const pick = pickRosterSheet([
      sheet('Interest form', ['a@uw.edu', 'b@uw.edu', 'c@uw.edu']),
      sheet('Team Members', ['a@uw.edu']),
    ])
    expect(pick?.chosen.name).toBe('Team Members')
    expect(pick?.others).toEqual(['Interest form'])
  })

  it('otherwise takes the most emails, then the first title', () => {
    expect(pickRosterSheet([sheet('B', ['a@uw.edu']), sheet('A', ['a@uw.edu']), sheet('C', ['a@uw.edu', 'b@uw.edu'])])?.others)
      .toEqual(['A', 'B'])
  })
})

describe('resolveMemberGroups', () => {
  const ada = { id: 'ada', first_name: 'Ada', last_name: 'L', uw_email: 'Ada@uw.edu' }
  const bob = { id: 'bob', first_name: 'Bob', last_name: 'R', uw_email: 'bob@uw.edu' }
  const cy = { id: 'cy', first_name: 'Cy', last_name: 'T', uw_email: 'cy@uw.edu' }

  const speller: GroupSheet = { spreadsheetId: 's1', name: 'EEG Speller', emails: ['ada@uw.edu', 'x@uw.edu', 'y@uw.edu'] }
  const arm: GroupSheet = { spreadsheetId: 's2', name: 'Robot Arm', emails: ['bob@uw.edu', 'ada@uw.edu'] }

  it('gives a matched member the group name and the size of its sheet', () => {
    expect(resolveMemberGroups([bob], [speller, arm]).get('bob')).toEqual({
      project_groups: [{ name: 'Robot Arm', size: 2 }],
    })
  })

  it('gives an unmatched member no groups', () => {
    expect(resolveMemberGroups([cy], [speller, arm]).get('cy')).toEqual({ project_groups: [] })
  })

  it('matches the profile email case-insensitively', () => {
    expect(resolveMemberGroups([ada], [speller]).get('ada')?.project_groups[0].name).toBe('EEG Speller')
  })

  it('keeps every group a member is in, largest first', () => {
    expect(resolveMemberGroups([ada], [arm, speller]).get('ada')).toEqual({
      project_groups: [
        { name: 'EEG Speller', size: 3 },
        { name: 'Robot Arm', size: 2 },
      ],
    })
  })

  it('orders equal-sized groups by name, so the result is stable', () => {
    const a: GroupSheet = { spreadsheetId: 'a', name: 'Beta', emails: ['cy@uw.edu'] }
    const b: GroupSheet = { spreadsheetId: 'b', name: 'Alpha', emails: ['cy@uw.edu'] }
    expect(resolveMemberGroups([cy], [a, b]).get('cy')?.project_groups.map((g) => g.name)).toEqual(['Alpha', 'Beta'])
  })
})

describe('sameGroups', () => {
  it('compares names, sizes and order', () => {
    const one = [{ name: 'A', size: 2 }]
    expect(sameGroups(one, [{ name: 'A', size: 2 }])).toBe(true)
    expect(sameGroups(one, [{ name: 'A', size: 3 }])).toBe(false)
    expect(sameGroups(one, [])).toBe(false)
  })
})

describe('isProjectFolder', () => {
  it('skips numbered housekeeping folders', () => {
    expect(isProjectFolder('0. Project Example')).toBe(false)
    expect(isProjectFolder('1. Project Information Documents')).toBe(false)
    expect(isProjectFolder('2. Standup Templates')).toBe(false)
    expect(isProjectFolder('3) Archive')).toBe(false)
  })

  it('keeps project folders, including ones with numbers later in the name', () => {
    expect(isProjectFolder('Mind Games')).toBe(true)
    expect(isProjectFolder('Robot Arm 2.0')).toBe(true)
  })
})

describe('rosterCandidates', () => {
  it('reads only Project Members sheets when the folder has one', () => {
    const sheets = [{ name: 'Project Members - Mind Games' }, { name: 'NEW Member Sheet' }, { name: 'Budget' }]
    expect(rosterCandidates(sheets)).toEqual([{ name: 'Project Members - Mind Games' }])
  })

  it('falls back to every sheet when none is titled Project Members', () => {
    const sheets = [{ name: 'Roster' }, { name: 'Budget' }]
    expect(rosterCandidates(sheets)).toEqual(sheets)
  })
})
