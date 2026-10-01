import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { PageTransition } from '../components/PageTransition'

function Page({ label, to }: { label: string; to: string | number }) {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(to as string)}>
      {label}
    </button>
  )
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/a']}>
      <PageTransition>
        <Routes>
          <Route path="/a" element={<Page label="go to b" to="/b" />} />
          <Route path="/b" element={<Page label="go back" to={-1} />} />
        </Routes>
      </PageTransition>
    </MemoryRouter>,
  )
}

describe('PageTransition scroll reset', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    scrollTo.mockRestore()
  })

  it('opens a newly navigated-to page at the top', async () => {
    renderApp()
    scrollTo.mockClear()

    await userEvent.click(screen.getByText('go to b'))

    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  // Back/forward is left to the browser so a list keeps the reader's place.
  it('leaves scroll alone on back navigation', async () => {
    renderApp()
    await userEvent.click(screen.getByText('go to b'))
    scrollTo.mockClear()

    await userEvent.click(screen.getByText('go back'))

    expect(screen.getByText('go to b')).toBeInTheDocument()
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
