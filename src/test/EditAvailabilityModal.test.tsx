import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fetchAvailability, saveAvailability } from '../lib/availability'
import { EditAvailabilityModal } from '../components/user-dashboard/EditAvailabilityModal'

vi.mock('../lib/availability', async () => {
  const actual = await vi.importActual<typeof import('../lib/availability')>('../lib/availability')
  return { ...actual, fetchAvailability: vi.fn(), saveAvailability: vi.fn() }
})

beforeEach(() => {
  vi.mocked(fetchAvailability).mockReset().mockResolvedValue([])
  vi.mocked(saveAvailability).mockReset().mockResolvedValue(undefined)
})

const checkoutTarget = { kind: 'checkout' as const, loanRequestId: 'req-1' }
const returnTarget = {
  kind: 'return' as const,
  loanRequestId: 'req-1',
  loanRequestItemId: 'item-1',
}

/** The 8am slot on whatever today is — the first cell in the window. */
async function firstSlot() {
  const slots = await screen.findAllByRole('button', { name: /at 8:00 AM$/i })
  return slots[0]
}

describe('EditAvailabilityModal', () => {
  it('names which set of hours it is editing', async () => {
    render(<EditAvailabilityModal target={checkoutTarget} onClose={() => undefined} />)
    expect(
      await screen.findByRole('dialog', { name: /edit checkout availability/i }),
    ).toBeInTheDocument()
  })

  it('names the return set when that is what it was opened on', async () => {
    render(<EditAvailabilityModal target={returnTarget} onClose={() => undefined} />)
    expect(
      await screen.findByRole('dialog', { name: /edit return availability/i }),
    ).toBeInTheDocument()
  })

  // Editing means changing what you said, so the grid opens on it rather
  // than blank.
  it('opens on the hours already submitted', async () => {
    const today = new Date().toISOString().slice(0, 10)
    vi.mocked(fetchAvailability).mockResolvedValue([{ date: today, hour: 8 }])

    render(<EditAvailabilityModal target={checkoutTarget} onClose={() => undefined} />)

    expect(await firstSlot()).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks for the right set of hours', async () => {
    render(<EditAvailabilityModal target={returnTarget} onClose={() => undefined} />)

    await screen.findByRole('dialog')
    expect(fetchAvailability).toHaveBeenCalledWith(returnTarget)
  })

  it('saves the edited hours and closes', async () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(<EditAvailabilityModal target={checkoutTarget} onClose={onClose} onSaved={onSaved} />)

    await userEvent.click(await firstSlot())
    await userEvent.click(screen.getByRole('button', { name: /save availability/i }))

    const [target, slots] = vi.mocked(saveAvailability).mock.calls[0]
    expect(target).toEqual(checkoutTarget)
    expect(slots).toHaveLength(1)
    expect(slots[0].hour).toBe(8)
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  // Clearing every hour is a legitimate edit, not a no-op to be ignored.
  it('saves an empty set when every hour is cleared', async () => {
    const today = new Date().toISOString().slice(0, 10)
    vi.mocked(fetchAvailability).mockResolvedValue([{ date: today, hour: 8 }])
    render(<EditAvailabilityModal target={checkoutTarget} onClose={() => undefined} />)

    await userEvent.click(await firstSlot())
    await userEvent.click(screen.getByRole('button', { name: /save availability/i }))

    expect(vi.mocked(saveAvailability).mock.calls[0][1]).toEqual([])
  })

  it('stays open and says so when saving fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onClose = vi.fn()
    vi.mocked(saveAvailability).mockRejectedValue(new Error('offline'))
    render(<EditAvailabilityModal target={checkoutTarget} onClose={onClose} />)

    await userEvent.click(await firstSlot())
    await userEvent.click(screen.getByRole('button', { name: /save availability/i }))

    expect(await screen.findByText(/could not save your availability/i)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('discards the edit when cancelled', async () => {
    const onClose = vi.fn()
    render(<EditAvailabilityModal target={checkoutTarget} onClose={onClose} />)

    await userEvent.click(await firstSlot())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(saveAvailability).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('says so when the hours cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchAvailability).mockRejectedValue(new Error('offline'))
    render(<EditAvailabilityModal target={checkoutTarget} onClose={() => undefined} />)

    expect(await screen.findByText(/could not load your availability/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save availability/i })).toBeDisabled()
    consoleError.mockRestore()
  })
})
