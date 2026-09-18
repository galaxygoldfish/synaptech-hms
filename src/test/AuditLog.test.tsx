import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchAuditLog, type AuditLogEntry } from '../lib/auditLog'
import AuditLog from '../components/admin-dashboard/AuditLog'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/auditLog', async () => {
  const actual = await vi.importActual<typeof import('../lib/auditLog')>('../lib/auditLog')
  return { ...actual, fetchAuditLog: vi.fn() }
})

const mockSession = { user: { id: 'admin-1', email: 'admin@uw.edu' } } as unknown as Session

const mockProfile = {
  id: 'admin-1',
  first_name: 'Ada',
  last_name: 'Admin',
  role: 'admin' as const,
  uw_email: 'admin@uw.edu',
  discord: 'ada#0001',
  address: '123 Way',
}

function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: 'entry-1',
    occurredAt: '2026-09-17T18:30:00.000Z',
    category: 'members',
    action: 'member.signed_up',
    actorId: 'member-1',
    actorName: 'Bob Reyes',
    actorEmail: 'bob@uw.edu',
    entityType: 'member',
    entityId: 'member-1',
    entityKey: null,
    entityLabel: 'Bob Reyes',
    summary: 'Bob Reyes created an account',
    changes: [],
    ...overrides,
  }
}

const roleChange = entry({
  id: 'entry-role',
  action: 'member.role_changed',
  actorId: 'admin-1',
  actorName: 'Ada Admin',
  actorEmail: 'admin@uw.edu',
  summary: "Bob Reyes's role changed from member to admin",
  changes: [{ field: 'role', from: 'member', to: 'admin' }],
})

const profileEdit = entry({
  id: 'entry-profile',
  action: 'member.profile_updated',
  summary: "Bob Reyes's profile details were updated",
  changes: [
    { field: 'discord', from: 'bob#2', to: 'bob#22' },
    { field: 'phone', hidden: 'pii' },
  ],
})

const equipmentAdded = entry({
  id: 'entry-equipment',
  category: 'inventory',
  action: 'equipment.created',
  actorId: 'admin-1',
  actorName: 'Ada Admin',
  actorEmail: 'admin@uw.edu',
  entityType: 'equipment',
  entityLabel: 'Muse 2',
  summary: 'Muse 2 was added to the inventory',
})

// No signed-in user performed this one — the scheduled reminder function,
// a service-role script, or a change made straight in the database.
const systemEntry = entry({
  id: 'entry-system',
  category: 'loans',
  action: 'loan_item.updated',
  actorId: null,
  actorName: null,
  actorEmail: null,
  entityType: 'loan_request_item',
  entityLabel: 'Muse 2 (SYN-ABC123)',
  summary: 'Muse 2 (SYN-ABC123) was updated on a checkout request',
  changes: [{ field: 'return_date', from: '2026-10-01', to: '2026-10-08' }],
})

beforeEach(() => {
  vi.mocked(fetchAuditLog).mockReset()
  vi.mocked(useAuth).mockReturnValue({
    session: mockSession,
    profile: mockProfile,
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

function renderAuditLog() {
  return render(
    <MemoryRouter initialEntries={['/adminHome/audit-log']}>
      <AuditLog />
    </MemoryRouter>,
  )
}

describe('AuditLog', () => {
  it('lists every recorded event, newest first as the query returns them', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({
      entries: [roleChange, equipmentAdded, systemEntry],
      hasMore: false,
    })

    renderAuditLog()

    expect(await screen.findByText("Bob Reyes's role changed from member to admin")).toBeInTheDocument()
    expect(screen.getByText('Muse 2 was added to the inventory')).toBeInTheDocument()
    expect(screen.getByText('Showing 3 of 3')).toBeInTheDocument()
  })

  it('attributes an entry with no actor to the system rather than leaving it blank', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({ entries: [systemEntry], hasMore: false })

    renderAuditLog()

    expect(await screen.findByText('System')).toBeInTheDocument()
    expect(screen.getByText('Automated or direct database change')).toBeInTheDocument()
  })

  it('narrows to one category when its filter chip is pressed', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({
      entries: [roleChange, equipmentAdded],
      hasMore: false,
    })

    renderAuditLog()
    await screen.findByText("Bob Reyes's role changed from member to admin")

    await userEvent.click(screen.getByRole('button', { name: 'Inventory' }))

    expect(screen.getByText('Muse 2 was added to the inventory')).toBeInTheDocument()
    expect(screen.queryByText("Bob Reyes's role changed from member to admin")).not.toBeInTheDocument()
  })

  // The changed field names are part of the haystack on purpose: "who
  // touched this member's phone number" is a question an auditor asks, and
  // the values themselves are deliberately not stored to search against.
  it('searches the names of the fields that changed, not just the summary', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({
      entries: [profileEdit, equipmentAdded],
      hasMore: false,
    })

    renderAuditLog()
    await screen.findByText("Bob Reyes's profile details were updated")

    await userEvent.type(
      screen.getByRole('textbox', { name: /search by person/i }),
      'phone number',
    )

    expect(screen.getByText("Bob Reyes's profile details were updated")).toBeInTheDocument()
    expect(screen.queryByText('Muse 2 was added to the inventory')).not.toBeInTheDocument()
  })

  it('shows before and after values in the detail modal, but never a withheld one', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({ entries: [profileEdit], hasMore: false })

    renderAuditLog()
    await userEvent.click(await screen.findByRole('button', { name: /profile details were updated/ }))

    const modal = within(screen.getByRole('dialog'))
    expect(modal.getByText('bob#2')).toBeInTheDocument()
    expect(modal.getByText('bob#22')).toBeInTheDocument()
    expect(modal.getByText(/values not kept in the log/i)).toBeInTheDocument()
  })

  it('says so plainly when an event has no field-level diff', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({ entries: [equipmentAdded], hasMore: false })

    renderAuditLog()
    await userEvent.click(await screen.findByRole('button', { name: /added to the inventory/ }))

    const modal = within(screen.getByRole('dialog'))
    expect(modal.getByText(/no field-level changes were recorded/i)).toBeInTheDocument()
  })

  it('distinguishes an empty log from a search that matched nothing', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({ entries: [], hasMore: false })

    renderAuditLog()

    expect(await screen.findByText(/nothing has been recorded yet/i)).toBeInTheDocument()

    vi.mocked(fetchAuditLog).mockResolvedValue({ entries: [equipmentAdded], hasMore: false })
    renderAuditLog()

    await userEvent.type(
      (await screen.findAllByRole('textbox', { name: /search by person/i }))[1],
      'nothing matches this',
    )

    expect(screen.getByText(/no activity matches your search/i)).toBeInTheDocument()
  })

  it('says the list is capped when the log holds more than it fetched', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({ entries: [equipmentAdded], hasMore: true })

    renderAuditLog()

    expect(await screen.findByText(/most recent \(the log keeps more than 500\)/)).toBeInTheDocument()
  })

  it('surfaces a load failure instead of an empty log', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchAuditLog).mockRejectedValue(new Error('network down'))

    renderAuditLog()

    expect(await screen.findByText(/could not load the audit log/i)).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
