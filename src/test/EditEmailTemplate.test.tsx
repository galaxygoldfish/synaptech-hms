import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchEmailTemplate } from '../lib/emailTemplates'
import EditEmailTemplate from '../components/admin-dashboard/EditEmailTemplate'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/emailTemplates', async () => {
  const actual = await vi.importActual<typeof import('../lib/emailTemplates')>('../lib/emailTemplates')
  return {
    ...actual,
    fetchEmailTemplate: vi.fn(),
    updateEmailTemplateContent: vi.fn(),
  }
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

beforeEach(() => {
  // This suite's mocks would otherwise leak between tests in this file —
  // vitest isn't configured with clearMocks/restoreMocks globally.
  vi.mocked(fetchEmailTemplate).mockReset()
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

function renderEditor() {
  const router = createMemoryRouter(
    [{ path: '/adminHome/emails/:category/:templateId', element: <EditEmailTemplate /> }],
    { initialEntries: ['/adminHome/emails/user/return-reminder-one-week'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('EditEmailTemplate — loading an existing body', () => {
  it('re-populates the editor after navigating from one template to another', async () => {
    // Exercises a route *transition* rather than a fresh mount: react-router
    // keeps the same EditEmailTemplate instance and just updates params, so
    // this is the scenario the isLoading/template effect has to handle —
    // editorRef.current goes null -> element -> null -> element as the
    // skeleton and the real editor swap places a second time.
    vi.mocked(fetchEmailTemplate)
      .mockResolvedValueOnce({
        key: 'return-reminder-one-week',
        category: 'user',
        label: 'Return reminder (1 week before)',
        dynamicFields: [],
        subject: 'First subject',
        body: [{ type: 'text', value: 'First body text.' }],
        enabled: true,
      })
      .mockResolvedValueOnce({
        key: 'return-reminder-due-date',
        category: 'user',
        label: 'Return reminder (due date)',
        dynamicFields: [],
        subject: 'Second subject',
        body: [{ type: 'text', value: 'Second body text.' }],
        enabled: true,
      })

    const router = createMemoryRouter(
      [{ path: '/adminHome/emails/:category/:templateId', element: <EditEmailTemplate /> }],
      { initialEntries: ['/adminHome/emails/user/return-reminder-one-week'] },
    )
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(document.querySelector('[contenteditable="true"]')?.textContent).toContain('First body text.')
    })

    await act(async () => {
      await router.navigate('/adminHome/emails/user/return-reminder-due-date')
    })

    await waitFor(() => {
      const editor = document.querySelector('[contenteditable="true"]')
      expect(editor?.textContent).toContain('Second body text.')
      expect(editor?.textContent).not.toContain('First body text.')
    })
  })


  it('renders the saved body text once the template has loaded, not a blank editor', async () => {
    vi.mocked(fetchEmailTemplate).mockResolvedValue({
      key: 'return-reminder-one-week',
      category: 'user',
      label: 'Return reminder (1 week before)',
      dynamicFields: ['user_name', 'hardware_name'],
      subject: 'Your hardware is due soon',
      body: [
        { type: 'text', value: 'Hello ' },
        { type: 'chip', field: 'user_name' },
        { type: 'text', value: ', please return your item soon.' },
      ],
      enabled: true,
    })

    renderEditor()

    // Subject (plain React state) should show up regardless.
    await waitFor(() => {
      expect(screen.getByDisplayValue('Your hardware is due soon')).toBeInTheDocument()
    })

    // The body is populated imperatively into a contentEditable div, so
    // assert on its actual text content rather than a queryable element.
    const editor = document.querySelector('[contenteditable="true"]')
    expect(editor).not.toBeNull()
    await waitFor(() => {
      expect(editor?.textContent).toContain('Hello')
      expect(editor?.textContent).toContain('please return your item soon.')
    })
  })
})
