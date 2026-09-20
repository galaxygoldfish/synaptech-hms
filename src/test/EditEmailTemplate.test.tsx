import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchEmailTemplate,
  fetchTemplateRecipients,
  setEmailTemplateArchiveCc,
  setTemplateRecipientCc,
  updateEmailTemplateContent,
} from '../lib/emailTemplates'
import EditEmailTemplate from '../components/admin-dashboard/EditEmailTemplate'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/emailTemplates', async () => {
  const actual = await vi.importActual<typeof import('../lib/emailTemplates')>('../lib/emailTemplates')
  return {
    ...actual,
    fetchEmailTemplate: vi.fn(),
    updateEmailTemplateContent: vi.fn(),
    fetchTemplateRecipients: vi.fn(),
    setTemplateRecipientCc: vi.fn(),
    setEmailTemplateArchiveCc: vi.fn(),
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
  vi.mocked(updateEmailTemplateContent).mockReset()
  vi.mocked(updateEmailTemplateContent).mockResolvedValue({
    key: 'return-reminder-one-week',
    category: 'user',
    label: 'Return reminder (1 week before)',
    dynamicFields: [],
    subject: '',
    body: [],
    enabled: true,
    archiveCcEnabled: true,
  })
  // Empty by default so tests that don't care about the Recipients section
  // don't need to stub it — and, since it's a real network call otherwise,
  // so they never hit the live Supabase project either.
  vi.mocked(fetchTemplateRecipients).mockReset()
  vi.mocked(fetchTemplateRecipients).mockResolvedValue([])
  vi.mocked(setTemplateRecipientCc).mockReset()
  vi.mocked(setTemplateRecipientCc).mockResolvedValue(undefined)
  vi.mocked(setEmailTemplateArchiveCc).mockReset()
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
        archiveCcEnabled: true,
      })
      .mockResolvedValueOnce({
        key: 'return-reminder-due-date',
        category: 'user',
        label: 'Return reminder (due date)',
        dynamicFields: [],
        subject: 'Second subject',
        body: [{ type: 'text', value: 'Second body text.' }],
        enabled: true,
        archiveCcEnabled: true,
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
      archiveCcEnabled: true,
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

describe('EditEmailTemplate — saving a multi-line body', () => {
  // Pressing Enter in a contentEditable doesn't insert a '\n' character —
  // the browser wraps each subsequent line in its own element instead (a
  // bare <div> in Chrome/Safari; a blank line becomes <div><br></div>).
  // domToSegments used to read only the editor's direct children, so
  // anything past the first line was neither a text node nor a chip and
  // was silently dropped — a saved multi-line body came back as one line
  // on the very next visit to this screen. These set the editor's
  // innerHTML directly to the exact structure real browsers produce,
  // since jsdom's execCommand doesn't simulate that browser behavior.
  async function loadEditorAndSave(editorHtml: string) {
    vi.mocked(fetchEmailTemplate).mockResolvedValue({
      key: 'return-reminder-one-week',
      category: 'user',
      label: 'Return reminder (1 week before)',
      dynamicFields: [],
      subject: 'Subject',
      body: [{ type: 'text', value: 'placeholder' }],
      enabled: true,
      archiveCcEnabled: true,
    })

    renderEditor()

    const editor = await waitFor(() => {
      const el = document.querySelector('[contenteditable="true"]')
      expect(el?.textContent).toContain('placeholder')
      return el as HTMLElement
    })

    editor.innerHTML = editorHtml

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(updateEmailTemplateContent).toHaveBeenCalled()
    })

    return vi.mocked(updateEmailTemplateContent).mock.calls[0][1].body
  }

  it('keeps every line when the browser wrapped them in <div>s', async () => {
    const body = await loadEditorAndSave('Hello<div>Second line</div><div>Third line</div>')
    expect(body).toEqual([{ type: 'text', value: 'Hello\nSecond line\nThird line' }])
  })

  it('preserves exactly one blank line for a <div><br></div> placeholder', async () => {
    const body = await loadEditorAndSave('Hello<div><br></div><div>Second line</div>')
    expect(body).toEqual([{ type: 'text', value: 'Hello\n\nSecond line' }])
  })

  it('preserves a Shift+Enter soft break (a bare <br>, no wrapping element)', async () => {
    const body = await loadEditorAndSave('Line A<br>Line B')
    expect(body).toEqual([{ type: 'text', value: 'Line A\nLine B' }])
  })
})

describe('EditEmailTemplate — Recipients section', () => {
  function mockTemplate(key: string, archiveCcEnabled = true) {
    vi.mocked(fetchEmailTemplate).mockResolvedValue({
      key,
      category: 'admin',
      label: 'Hardware item added to inventory',
      dynamicFields: [],
      subject: '',
      body: [],
      enabled: true,
      archiveCcEnabled,
    })
  }

  it('shows the fixed, non-toggleable Recipient description for a member-facing template', async () => {
    mockTemplate('checkout-request-confirmation')
    vi.mocked(fetchTemplateRecipients).mockResolvedValue([])

    renderEditor()

    await waitFor(() => {
      expect(screen.getByText('The member who made the request.')).toBeInTheDocument()
    })
    // Fixed text, not a control — this used to be a toggleable "To" switch.
    expect(screen.queryByRole('switch', { name: /direct recipient/i })).not.toBeInTheDocument()
  })

  it('shows Synaptech’s name and address as the fixed Recipient for a broadcast admin template, and hides it from the CC list below', async () => {
    mockTemplate('hardware-item-added')
    vi.mocked(fetchTemplateRecipients).mockResolvedValue([
      { id: 'admin-1', name: 'Ada Admin', email: 'admin@uw.edu', ccEnabled: false },
    ])

    renderEditor()

    // Waiting on the CC list (loaded separately, see fetchTemplateRecipients)
    // rather than the Recipient row above it, which renders as soon as the
    // template itself loads and so would resolve before the CC section
    // finishes its own, independent loading state.
    await waitFor(() => {
      expect(screen.getByText('Ada Admin')).toBeInTheDocument()
    })
    // The header also says "Synaptech" (the app's own branding), so this
    // pins down the specific name+email pair in the Recipient row rather
    // than counting every "Synaptech" text node on the page.
    const recipientEmail = screen.getByText('synaptechuw@gmail.com')
    expect(recipientEmail.previousElementSibling).toHaveTextContent('Synaptech')
    // The CC list still shows real admins — only the redundant Synaptech
    // row (it's already the fixed recipient above) is suppressed.
    expect(screen.queryByRole('switch', { name: /synaptech/i })).not.toBeInTheDocument()
  })

  it('lists every current admin with a toggleable CC switch, off by default', async () => {
    mockTemplate('hardware-item-added')
    vi.mocked(fetchTemplateRecipients).mockResolvedValue([
      { id: 'admin-1', name: 'Ada Admin', email: 'admin@uw.edu', ccEnabled: false },
      { id: 'admin-2', name: 'Bo Boss', email: 'bo@uw.edu', ccEnabled: true },
    ])

    renderEditor()

    await waitFor(() => {
      expect(screen.getByText('Ada Admin')).toBeInTheDocument()
    })
    expect(screen.getByText('bo@uw.edu')).toBeInTheDocument()

    expect(screen.getByRole('switch', { name: /add ada admin as a cc/i })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: /remove bo boss as a cc/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('toggling an admin CC switch saves the change and flips it optimistically', async () => {
    mockTemplate('hardware-item-added')
    vi.mocked(fetchTemplateRecipients).mockResolvedValue([
      { id: 'admin-1', name: 'Ada Admin', email: 'admin@uw.edu', ccEnabled: false },
    ])

    renderEditor()

    const ccSwitch = await screen.findByRole('switch', { name: /add ada admin as a cc/i })

    const user = userEvent.setup()
    await user.click(ccSwitch)

    await waitFor(() => {
      expect(setTemplateRecipientCc).toHaveBeenCalledWith('hardware-item-added', 'admin-1', true, 'admin-1')
    })
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /remove ada admin as a cc/i })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })
  })

  it('shows a Synaptech CC row for a template whose recipient is a member, and lets it be toggled', async () => {
    mockTemplate('checkout-request-confirmation', true)
    vi.mocked(fetchTemplateRecipients).mockResolvedValue([])
    vi.mocked(setEmailTemplateArchiveCc).mockResolvedValue({
      key: 'checkout-request-confirmation',
      category: 'user',
      label: 'Checkout request confirmation',
      dynamicFields: [],
      subject: '',
      body: [],
      enabled: true,
      archiveCcEnabled: false,
    })

    renderEditor()

    const synaptechSwitch = await screen.findByRole('switch', {
      name: /remove synaptech.?s archive address as a cc/i,
    })
    expect(screen.getByText('synaptechuw@gmail.com')).toBeInTheDocument()
    expect(synaptechSwitch).toHaveAttribute('aria-checked', 'true')

    const user = userEvent.setup()
    await user.click(synaptechSwitch)

    await waitFor(() => {
      expect(setEmailTemplateArchiveCc).toHaveBeenCalledWith('checkout-request-confirmation', false, 'admin-1')
    })
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: /add synaptech.?s archive address as a cc/i }),
      ).toHaveAttribute('aria-checked', 'false')
    })
  })
})
