import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchAllProfiles,
  fetchLastGroupSync,
  GroupSyncBusyError,
  syncMemberGroups,
  type GroupSyncRun,
} from '../lib/members'
import { clearCache } from '../lib/queryCache'
import ViewMembers from '../components/admin-dashboard/ViewMembers'
import type { Profile } from '../types/index'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/members', async () => {
  const actual = await vi.importActual<typeof import('../lib/members')>('../lib/members')
  return {
    ...actual,
    fetchAllProfiles: vi.fn(),
    peekAllProfiles: vi.fn(() => null),
    fetchLastGroupSync: vi.fn(),
    syncMemberGroups: vi.fn(),
  }
})

const base: Profile = {
  id: 'm1',
  first_name: 'Bob',
  last_name: 'Reyes',
  phone: '',
  student_id: '',
  uw_email: 'bob@uw.edu',
  address: '',
  discord: 'bobreyes',
  role: 'member',
  created_at: '2026-08-16T12:00:00Z',
  updated_at: '2026-08-16T12:00:00Z',
  project_groups: [{ name: 'EEG Speller', size: 5 }],
}

const loner: Profile = {
  ...base,
  id: 'm2',
  first_name: 'Cy',
  last_name: 'Tran',
  uw_email: 'cy@uw.edu',
  discord: 'cyt',
  project_groups: [],
}

const lastRun: GroupSyncRun = {
  id: 'run-1',
  started_at: '2026-11-04T09:15:00Z',
  finished_at: '2026-11-04T09:15:20Z',
  ok: true,
  trigger: 'cron',
  sheets_scanned: 3,
  members_matched: 10,
  warnings: ['Cy Tran is listed in 2 groups (A, B); showing A.'],
  error: null,
}

beforeEach(() => {
  clearCache()
  vi.mocked(fetchAllProfiles).mockReset().mockResolvedValue([base, loner])
  vi.mocked(fetchLastGroupSync).mockReset().mockResolvedValue(lastRun)
  vi.mocked(syncMemberGroups).mockReset()
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'admin-1' } } as unknown as Session,
    profile: { ...base, id: 'admin-1', role: 'admin' },
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

function renderList() {
  return render(
    <MemoryRouter>
      <ViewMembers />
    </MemoryRouter>,
  )
}

describe('ViewMembers — project groups', () => {
  it('shows each member’s group and size, with 1 · None for no group', async () => {
    renderList()

    expect(await screen.findByText('5 · EEG Speller')).toBeInTheDocument()
    expect(screen.getByText('1 · None')).toBeInTheDocument()
  })

  it('finds members by group name', async () => {
    renderList()
    await screen.findByText('5 · EEG Speller')

    await userEvent.type(screen.getByPlaceholderText('Search members'), 'speller')

    expect(screen.getByText('Bob Reyes')).toBeInTheDocument()
    expect(screen.queryByText('Cy Tran')).not.toBeInTheDocument()
  })

  it('shows when groups were last synced, with that run’s warnings', async () => {
    renderList()

    expect(await screen.findByText(/Groups last synced/)).toBeInTheDocument()
    expect(screen.getByText('1 warning from the last sync')).toBeInTheDocument()
  })

  it('runs a sync and reloads the list', async () => {
    vi.mocked(syncMemberGroups).mockResolvedValue({ sheetsScanned: 3, membersMatched: 10, membersUpdated: 2, warnings: [] })
    renderList()
    await screen.findByText('5 · EEG Speller')
    vi.mocked(fetchAllProfiles).mockResolvedValue([{ ...base, project_groups: [{ name: 'Robot Arm', size: 4 }, { name: 'EEG Speller', size: 5 }] }, loner])

    await userEvent.click(screen.getByRole('button', { name: 'Sync project groups' }))

    expect(syncMemberGroups).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Synced 3 group sheets: 10 members are in a group.')).toBeInTheDocument()
    expect(await screen.findByText('4 · Robot Arm')).toBeInTheDocument()
    expect(screen.getByText('5 · EEG Speller')).toBeInTheDocument()
  })

  it('says so when a sync is already running', async () => {
    vi.mocked(syncMemberGroups).mockRejectedValue(new GroupSyncBusyError())
    renderList()
    await screen.findByText('5 · EEG Speller')

    await userEvent.click(screen.getByRole('button', { name: 'Sync project groups' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A group sync is already running')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync project groups' })).toBeEnabled())
  })
})
