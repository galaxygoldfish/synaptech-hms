import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import AdminHomePage from '../pages/AdminHomePage'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

// A fake database: every query on a table resolves to its rows, and each
// request is counted so the test can see how many a visit costs.
const tables: Record<string, unknown[]> = {
  loan_requests: [{ id: 'req-1', user_id: 'member-1', status: 'approved', requested_at: '2026-09-01T00:00:00Z' }],
  loan_request_items: [
    {
      id: 'item-1',
      loan_request_id: 'req-1',
      equipment_id: 'eq-1',
      equipment_unit_id: null,
      return_date: '2099-01-01',
      returned_at: null,
      return_requested_at: null,
    },
  ],
  equipment: [{ id: 'eq-1', name: 'Muse 2', image_url: null }],
  equipment_units: [],
  profiles: [{ id: 'member-1', first_name: 'Bob', last_name: 'Reyes' }],
}
let requests = 0

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      requests += 1
      const result = Promise.resolve({ data: tables[table] ?? [], error: null })
      const chain = {
        select: () => chain,
        // Deliberately thenable: the real PostgREST builder is awaited directly.
        // oxlint-disable-next-line unicorn/no-thenable
        then: result.then.bind(result),
      }
      return chain
    },
  },
}))

beforeEach(() => {
  requests = 0
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'admin-1', email: 'ada@uw.edu' } } as unknown as Session,
    profile: { id: 'admin-1', first_name: 'Ada', last_name: 'Admin', role: 'admin', uw_email: 'ada@uw.edu', discord: 'ada', address: '1 Way' },
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

function visitDashboard() {
  const router = createMemoryRouter([{ path: '/adminHome', element: <AdminHomePage /> }], {
    initialEntries: ['/adminHome'],
  })
  return render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

describe('returning to the admin dashboard', () => {
  it('shows the counts on the first render of a return visit', async () => {
    const first = visitDashboard()
    // Let the first visit's fetch land.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(screen.getByText('Active')).toBeInTheDocument()
    first.unmount()

    visitDashboard()

    // No waiting: the count must be there straight away.
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('costs one set of queries per visit, even under StrictMode', async () => {
    visitDashboard()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    // One parallel read of the five tables, not two.
    expect(requests).toBe(5)
  })
})
