import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { readStash } from '../lib/queryCache'
import { usePrefetchNavigate } from '../lib/usePrefetchNavigate'

let fetcher: ReturnType<typeof vi.fn<() => Promise<unknown>>>

function List() {
  const navigate = useNavigate()
  const { open, pendingKey } = usePrefetchNavigate()
  return (
    <>
      <button type="button" onClick={() => void open('thing:1', fetcher, '/detail')} aria-busy={pendingKey === 'thing:1'}>
        open
      </button>
      <button type="button" onClick={() => navigate('/elsewhere')}>
        leave
      </button>
    </>
  )
}

function renderList() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <List /> },
      { path: '/detail', element: <p>Detail screen</p> },
      { path: '/elsewhere', element: <p>Somewhere else</p> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  fetcher = vi.fn<() => Promise<unknown>>().mockResolvedValue({ name: 'fetched' })
})

describe('usePrefetchNavigate', () => {
  it('fetches, stashes for the next screen, then navigates', async () => {
    renderList()
    await userEvent.click(screen.getByRole('button', { name: 'open' }))

    expect(await screen.findByText('Detail screen')).toBeInTheDocument()
    expect(readStash('thing:1')).toEqual({ name: 'fetched' })
  })

  it('stays put, marked busy, until the fetch lands', async () => {
    let finish: (value: unknown) => void = () => {}
    fetcher.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('button', { name: 'open' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Detail screen')).not.toBeInTheDocument()

    await act(async () => finish({}))
    expect(await screen.findByText('Detail screen')).toBeInTheDocument()
  })

  it('ignores a second tap while the first is loading', async () => {
    let finish: (value: unknown) => void = () => {}
    fetcher.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    await act(async () => finish({}))

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  // The bug this guards: tap a row, go back before it loads, and get yanked
  // onto the detail screen anyway.
  it('does not navigate if the user has left before the fetch lands', async () => {
    let finish: (value: unknown) => void = () => {}
    fetcher.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const router = renderList()

    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    await userEvent.click(screen.getByRole('button', { name: 'leave' }))
    await act(async () => finish({}))

    expect(screen.getByText('Somewhere else')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/elsewhere')
  })

  it('still navigates when the fetch fails, leaving the screen to load itself', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetcher.mockRejectedValue(new Error('offline'))
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'open' }))

    expect(await screen.findByText('Detail screen')).toBeInTheDocument()
    expect(readStash('thing:1')).toBeUndefined()
    vi.mocked(console.error).mockRestore()
  })
})
